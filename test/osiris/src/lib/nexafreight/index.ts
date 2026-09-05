/**
 * NexaFreight client library — public exports
 *
 * Import from here rather than the individual modules:
 *   import { nexaClient, NexaHttpError, type ShipmentListItem } from '@/lib/nexafreight'
 */

// Types
export type {
  UserRole,
  TransportMode,
  ShipmentStatus,
  LegStatus,
  Provenance,
  OrderSlaStatus,
  LoginRequest,
  LoginResponse,
  UserProfile,
  User,
  PaginatedResponse,
  ShipmentListItem,
  ShipmentDetail,
  Leg,
  LegDetail,
  VesselInfo,
  Order,
  OrderSummary,
  Event,
  ShipmentEvent,
  Port,
  PortFeature,
  PortFeatureCollection,
  PortFeatureProperties,
  RouteQuality,
  GeoJSONGeometry,
  RouteFeature,
  RouteFeatureCollection,
  PositionReport,
  PositionOut,
  FeedHealth,
  FeedHealthOut,
  FeedHealthResponse,
} from './types'

// Errors
export { NexaError, NexaHttpError, NexaNetworkError } from './errors'

// Client functions + convenience namespace
export {
  setToken,
  clearToken,
  getToken,
  hasToken,
  BASE_URL,
  login,
  getCurrentUser,
  getShipments,
  getShipmentDetail,
  getShipmentRoute,
  getPorts,
  getAllRoutes,
  getFeedHealth,
  nexaClient,
  type GetShipmentsParams,
} from './client'

