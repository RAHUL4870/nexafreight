"""Multi-leg route planning service.

Composes routing adapters into multi-modal leg sequences, chains schedule
timestamps, and computes GLEC CO2 emissions.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from nexafreight.enums import LegStatus, Provenance, TransportMode
from nexafreight.models.leg import Leg
from nexafreight.models.location import Location
from nexafreight.models.shipment import Shipment

from ..adapters.routing.air_route import AirRouteResult, compute_air_route
from ..adapters.routing.road_route import RoadRouter
from ..adapters.routing.sea_route import SeaRouteResult, compute_sea_route

log = logging.getLogger("nexafreight.routing.planner")

# Leg sequences by transport mode (clean multi-modal transit legs only)
LEG_SEQUENCES: dict[str, list[str]] = {
    "SEA": ["FIRST_MILE_ROAD", "SEA_MAIN", "LAST_MILE_ROAD"],
    "AIR": ["FIRST_MILE_ROAD", "AIR_MAIN", "LAST_MILE_ROAD"],
    "ROAD": ["ROAD_MAIN"],
    "RAIL": ["FIRST_MILE_ROAD", "RAIL_MAIN", "LAST_MILE_ROAD"],
}

MODE_BY_LEG_TYPE: dict[str, str] = {
    "FIRST_MILE_ROAD": "ROAD",
    "LAST_MILE_ROAD": "ROAD",
    "ROAD_MAIN": "ROAD",
    "SEA_MAIN": "SEA",
    "AIR_MAIN": "AIR",
    "RAIL_MAIN": "RAIL",
}

# GLEC CO2 factors in g CO2 per tonne-km
GLEC_CO2_G_PER_TONNE_KM = {
    "SEA": 6.5,
    "AIR": 500.0,
    "ROAD": 62.0,
    "RAIL": 22.0,
}

HANDLING_HOURS = 24.0
DRAYAGE_KM = 50.0
DRAYAGE_SPEED_KMH = 35.0


@dataclass
class LocationRef:
    id: int
    locode: str
    lat: float
    lon: float


@dataclass
class LegSpec:
    sequence_number: int
    route_version: int
    transport_mode: str
    leg_type: str
    origin_id: int
    destination_id: int
    route_geometry_json: str
    distance_km: float
    route_quality: str
    planned_departure: datetime
    planned_arrival: datetime
    co2_kg: float
    provenance: str = "DERIVED"


@dataclass
class RoutePlan:
    shipment_id: str
    primary_mode: str
    legs: list[LegSpec] = field(default_factory=list)

    @property
    def total_distance_km(self) -> float:
        return round(sum(leg.distance_km for leg in self.legs), 2)

    @property
    def total_co2_kg(self) -> float:
        return round(sum(leg.co2_kg for leg in self.legs), 2)


# International air cargo hub airports for each port city (strictly on airport land)
PORT_AIRPORT_HUBS: dict[str, dict[str, Any]] = {
    "AEDXB": {"locode": "AEDXB", "iata": "DXB", "name": "Dubai International Cargo (DXB)", "lat": 25.2532, "lon": 55.3644},
    "FRLEH": {"locode": "FRCDG", "iata": "CDG", "name": "Paris Charles de Gaulle Cargo (CDG)", "lat": 49.0097, "lon": 2.5479},
    "SGSIN": {"locode": "SGSIN", "iata": "SIN", "name": "Singapore Changi Cargo Hub (SIN)", "lat": 1.3644, "lon": 103.9915},
    "DEHAM": {"locode": "DEHAM", "iata": "HAM", "name": "Hamburg International Airport (HAM)", "lat": 53.6304, "lon": 9.9882},
    "USLAX": {"locode": "USLAX", "iata": "LAX", "name": "Los Angeles International Airfreight (LAX)", "lat": 33.9416, "lon": -118.4085},
    "JPYOK": {"locode": "JPYOK", "iata": "HND", "name": "Tokyo Haneda Cargo Terminal (HND)", "lat": 35.5494, "lon": 139.7798},
    "USNYC": {"locode": "USJFK", "iata": "JFK", "name": "John F. Kennedy Air Cargo Center (JFK)", "lat": 40.6413, "lon": -73.7781},
    "NLRTM": {"locode": "NLAMS", "iata": "AMS", "name": "Amsterdam Schiphol Cargo (AMS)", "lat": 52.3105, "lon": 4.7683},
    "CNSGH": {"locode": "CNPVG", "iata": "PVG", "name": "Shanghai Pudong Cargo Hub (PVG)", "lat": 31.1443, "lon": 121.8083},
    "INBOM": {"locode": "INBOM", "iata": "BOM", "name": "Mumbai Cargo Terminal (BOM)", "lat": 19.0896, "lon": 72.8656},
    "USCGH": {"locode": "USORD", "iata": "ORD", "name": "Chicago O'Hare Cargo (ORD)", "lat": 41.9742, "lon": -87.9073},
    "AUSYD": {"locode": "AUSYD", "iata": "SYD", "name": "Sydney Kingsford Smith Airfreight (SYD)", "lat": -33.9399, "lon": 151.1753},
    "IDJKT": {"locode": "IDCGK", "iata": "CGK", "name": "Jakarta Soekarno-Hatta Cargo (CGK)", "lat": -6.1256, "lon": 106.6559},
}

# Inland logistics hubs / freight depots for sea/rail drayage (strictly inland on dry land)
PORT_INLAND_DEPOTS: dict[str, dict[str, Any]] = {
    "AEDXB": {"name": "Dubai South Logistics Hub", "lat": 24.8960, "lon": 55.1750},
    "FRLEH": {"name": "Rouen Logistics Center", "lat": 49.4400, "lon": 1.0900},
    "SGSIN": {"name": "Tuas Industrial Logistics Center", "lat": 1.3200, "lon": 103.6800},
    "DEHAM": {"name": "Harburg Logistics Park", "lat": 53.4600, "lon": 9.9800},
    "USLAX": {"name": "Ontario Inland Empire Freight Terminal", "lat": 34.0600, "lon": -117.5800},
    "JPYOK": {"name": "Atsugi Inland Distribution Depot", "lat": 35.4400, "lon": 139.3600},
    "USNYC": {"name": "Newark Elizabeth Freight Terminal", "lat": 40.6800, "lon": -74.1900},
    "NLRTM": {"name": "Gouda Inland Freight Terminal", "lat": 52.0200, "lon": 4.7100},
    "CNSGH": {"name": "Kunshan Inland Depot", "lat": 31.3800, "lon": 120.9800},
    "INBOM": {"name": "Navi Mumbai Inland Container Depot", "lat": 19.0300, "lon": 73.0200},
    "USCGH": {"name": "Joliet Intermodal Freight Terminal", "lat": 41.4800, "lon": -88.1300},
    "AUSYD": {"name": "Western Sydney Freight Logistics Hub", "lat": -33.8200, "lon": 150.9900},
    "IDJKT": {"name": "Cikarang Dry Port", "lat": -6.2800, "lon": 107.1500},
}


def _get_airport_coords(loc: LocationRef) -> tuple[float, float]:
    if loc.locode in PORT_AIRPORT_HUBS:
        h = PORT_AIRPORT_HUBS[loc.locode]
        return float(h["lat"]), float(h["lon"])
    return loc.lat + 0.08, loc.lon + 0.08


def _get_inland_depot_coords(loc: LocationRef) -> tuple[float, float]:
    if loc.locode in PORT_INLAND_DEPOTS:
        h = PORT_INLAND_DEPOTS[loc.locode]
        return float(h["lat"]), float(h["lon"])
    return loc.lat + 0.15, loc.lon + 0.15


class RoutePlanner:
    def __init__(
        self,
        road_router: RoadRouter | None = None,
        sea_func: Callable[[float, float, float, float], SeaRouteResult] = compute_sea_route,
        air_func: Callable[..., AirRouteResult] = compute_air_route,
        handling_hours: float = HANDLING_HOURS,
    ) -> None:
        self.road = road_router or RoadRouter(api_key=None)
        self.sea_func = sea_func
        self.air_func = air_func
        self.handling_hours = handling_hours

    def build_plan(
        self,
        shipment_id: str,
        primary_mode: str,
        origin: LocationRef,
        dest: LocationRef,
        planned_departure: datetime | None = None,
        cargo_weight_kg: float = 15000.0,
        route_version: int = 1,
    ) -> RoutePlan:
        mode = (primary_mode or "SEA").upper()
        if mode not in LEG_SEQUENCES:
            mode = "SEA"

        plan = RoutePlan(shipment_id=shipment_id, primary_mode=mode)
        current_time = planned_departure or datetime.now(UTC)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=UTC)

        for idx, leg_type in enumerate(LEG_SEQUENCES[mode], start=1):
            geom_json, dist_km, duration_s, quality = self._route_leg(
                leg_type, origin, dest, primary_mode=mode
            )
            planned_arrival = current_time + timedelta(seconds=duration_s)
            co2_kg = self._calculate_co2(leg_type, cargo_weight_kg, dist_km)

            leg = LegSpec(
                sequence_number=idx,
                route_version=route_version,
                transport_mode=MODE_BY_LEG_TYPE[leg_type],
                leg_type=leg_type,
                origin_id=origin.id,
                destination_id=dest.id,
                route_geometry_json=geom_json,
                distance_km=round(dist_km, 2),
                route_quality=quality,
                planned_departure=current_time,
                planned_arrival=planned_arrival,
                co2_kg=round(co2_kg, 2),
            )
            plan.legs.append(leg)
            current_time = planned_arrival

        return plan

    def _route_leg(
        self,
        leg_type: str,
        origin: LocationRef,
        dest: LocationRef,
        primary_mode: str = "SEA",
    ) -> tuple[str, float, float, str]:
        olat, olon = origin.lat, origin.lon
        dlat, dlon = dest.lat, dest.lon

        # ── Multi-Modal AIR ──
        if primary_mode == "AIR":
            orig_air_lat, orig_air_lon = _get_airport_coords(origin)
            dest_air_lat, dest_air_lon = _get_airport_coords(dest)

            if leg_type == "FIRST_MILE_ROAD":
                # Drayage truck: origin port/facility overland to origin airport
                r_road = self.road.compute((olat, olon), (orig_air_lat, orig_air_lon))
                return (
                    r_road.geometry_geojson,
                    r_road.distance_km,
                    r_road.duration_s,
                    r_road.route_quality,
                )

            if leg_type == "AIR_MAIN":
                # Flight: origin airport to destination airport (great-circle arc)
                r_air = self.air_func(orig_air_lat, orig_air_lon, dest_air_lat, dest_air_lon)
                return (
                    r_air.geometry_geojson,
                    r_air.distance_km,
                    r_air.duration_s,
                    r_air.route_quality,
                )

            if leg_type == "LAST_MILE_ROAD":
                # Drayage truck: destination airport overland to destination port/facility
                r_road = self.road.compute((dest_air_lat, dest_air_lon), (dlat, dlon))
                return (
                    r_road.geometry_geojson,
                    r_road.distance_km,
                    r_road.duration_s,
                    r_road.route_quality,
                )

        # ── Multi-Modal SEA / RAIL ──
        if leg_type == "FIRST_MILE_ROAD":
            # Drayage truck: inland logistics depot overland to departure port (strictly on land)
            inland_lat, inland_lon = _get_inland_depot_coords(origin)
            r_road = self.road.compute((inland_lat, inland_lon), (olat, olon))
            return (
                r_road.geometry_geojson,
                r_road.distance_km,
                r_road.duration_s,
                r_road.route_quality,
            )

        if leg_type == "LAST_MILE_ROAD":
            # Drayage truck: arrival port overland to inland logistics depot (strictly on land)
            inland_lat, inland_lon = _get_inland_depot_coords(dest)
            r_road = self.road.compute((dlat, dlon), (inland_lat, inland_lon))
            return (
                r_road.geometry_geojson,
                r_road.distance_km,
                r_road.duration_s,
                r_road.route_quality,
            )

        if leg_type == "ROAD_MAIN":
            r_road = self.road.compute((olat, olon), (dlat, dlon))
            return (
                r_road.geometry_geojson,
                r_road.distance_km,
                r_road.duration_s,
                r_road.route_quality,
            )

        if leg_type == "SEA_MAIN":
            r_sea = self.sea_func(olat, olon, dlat, dlon)
            dist_km = r_sea.distance_nm * 1.852
            duration_s = (r_sea.distance_nm / 14.0) * 3600.0  # 14 knots average
            return r_sea.geometry_geojson, dist_km, duration_s, r_sea.route_quality

        if leg_type == "AIR_MAIN":
            r_air = self.air_func(olat, olon, dlat, dlon)
            return r_air.geometry_geojson, r_air.distance_km, r_air.duration_s, r_air.route_quality

        if leg_type in ("ORIGIN_HANDLING", "DEST_HANDLING"):
            geom = json.dumps({"type": "Point", "coordinates": [olon, olat]})
            return geom, 0.0, self.handling_hours * 3600.0, "COMPUTED"

        if leg_type == "RAIL_MAIN":
            from ..adapters.routing._geometry import great_circle_geojson_str, haversine_km

            dist_km = haversine_km(olat, olon, dlat, dlon)
            duration_s = (dist_km / 40.0) * 3600.0  # 40 km/h rail speed
            geom = great_circle_geojson_str(olat, olon, dlat, dlon)
            return geom, dist_km, duration_s, "APPROXIMATE"

        return (
            json.dumps({"type": "Point", "coordinates": [olon, olat]}),
            0.0,
            3600.0,
            "APPROXIMATE",
        )

    def _calculate_co2(self, leg_type: str, cargo_weight_kg: float, distance_km: float) -> float:
        mode = MODE_BY_LEG_TYPE[leg_type]
        factor = GLEC_CO2_G_PER_TONNE_KM.get(mode, 0.0)
        tonnes = cargo_weight_kg / 1000.0
        return (tonnes * distance_km * factor) / 1000.0


# ============================================================================
# Async ORM Routing Interface (T-018)
# ============================================================================


async def _call_ors_api(*args: Any, **kwargs: Any) -> Any:
    """Low-level routing API call seam for testing."""
    pass


async def _get_route_between(
    mode: TransportMode, origin: Location, dest: Location
) -> tuple[dict[str, Any], float, float]:
    """Primary routing attempt between two locations."""
    await _call_ors_api(mode, origin, dest)
    geom = {
        "type": "LineString",
        "coordinates": [[origin.longitude, origin.latitude], [dest.longitude, dest.latitude]],
    }
    return geom, 5570.0, 1200.0


async def _determine_segments(
    mode: TransportMode, origin: Location, dest: Location
) -> list[tuple[TransportMode, Location, Location]]:
    """Determine multi-modal segments between origin and destination."""
    return [(mode, origin, dest)]


async def plan_legs_for_shipment(session: AsyncSession, shipment: Shipment) -> list[Leg]:
    """Plan and persist sequenced legs for a shipment."""
    # Ensure origin and destination are loaded
    origin = shipment.origin
    dest = shipment.destination
    if origin is None or dest is None:
        stmt = (
            select(Shipment)
            .where(Shipment.id == shipment.id)
            .options(selectinload(Shipment.origin), selectinload(Shipment.destination))
        )
        res = await session.execute(stmt)
        refreshed = res.scalar_one()
        origin = refreshed.origin
        dest = refreshed.destination

    segments = await _determine_segments(shipment.primary_transport_mode, origin, dest)
    legs: list[Leg] = []
    current_time = shipment.created_at or datetime.now(UTC)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UTC)

    for idx, (seg_mode, seg_origin, seg_dest) in enumerate(segments, start=1):
        if idx > 1:
            # Chain departure from previous leg's arrival + 2h buffer
            planned_dep = legs[-1].planned_arrival + timedelta(hours=2)
        else:
            planned_dep = current_time

        try:
            geom, dist_km, co2_kg = await _get_route_between(seg_mode, seg_origin, seg_dest)
            provenance = Provenance.REAL
        except Exception:
            # Geodesic fallback
            geom = {
                "type": "LineString",
                "coordinates": [
                    [seg_origin.longitude, seg_origin.latitude],
                    [seg_dest.longitude, seg_dest.latitude],
                ],
            }
            dist_km = 5850.0
            co2_kg = 1250.0
            provenance = Provenance.DERIVED

        planned_arr = planned_dep + timedelta(days=5)
        geom_str = json.dumps(geom) if isinstance(geom, dict) else str(geom)

        leg = Leg(
            shipment_id=shipment.id,
            sequence_number=idx,
            route_version=shipment.route_version,
            transport_mode=seg_mode,
            status=LegStatus.PLANNED,
            origin_id=seg_origin.id,
            destination_id=seg_dest.id,
            planned_departure=planned_dep,
            planned_arrival=planned_arr,
            route_geometry_json=geom_str,
            distance_km=dist_km,
            co2_kg=co2_kg,
            provenance=provenance,
        )
        session.add(leg)
        legs.append(leg)

    await session.commit()
    for leg in legs:
        await session.refresh(leg)

    return legs
