import request from './index'

// Types
export interface MiddlewareAssignment {
  id: string
  middlewareId: string
  tenantId: string
  assignedAt: string
  assignedBy: string
  notes?: string
  tenant?: {
    id: string
    name: string
    code: string
  }
  middleware?: {
    id: string
    name: string
    url: string
  }
}

export interface TenantMiddlewareInfo {
  tenantId: string
  tenantName: string
  tenantCode: string
  middleware: {
    id: string
    name: string
    url: string
    status: string
    assignmentMode: string
  } | null
  assignedAt?: string
}

export interface AssignTenantDto {
  tenantId: string
  notes?: string
}

export interface BatchAssignResult {
  success: string[]
  failed: Array<{
    tenantId: string
    reason: string
  }>
}

// API functions
export const middlewareAssignmentApi = {
  // Get assignments for a middleware
  getByMiddleware: (middlewareId: string) =>
    request.get<any, MiddlewareAssignment[]>(`/middleware-assignments/middleware/${middlewareId}`),

  // Get middleware for a tenant
  getByTenant: (tenantId: string) =>
    request.get<any, TenantMiddlewareInfo>(`/middleware-assignments/tenant/${tenantId}`),

  // Assign tenant to middleware
  assign: (middlewareId: string, data: AssignTenantDto) =>
    request.post<any, MiddlewareAssignment>(`/middleware-assignments/middleware/${middlewareId}/assign`, data),

  // Unassign tenant from middleware
  unassign: (middlewareId: string, tenantId: string) =>
    request.delete<any, void>(`/middleware-assignments/middleware/${middlewareId}/tenant/${tenantId}`),

  // Batch assign tenants
  batchAssign: (middlewareId: string, tenantIds: string[]) =>
    request.post<any, BatchAssignResult>(`/middleware-assignments/middleware/${middlewareId}/batch-assign`, { tenantIds }),
}

export default middlewareAssignmentApi
