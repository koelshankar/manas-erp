/**
 * The read services, and the one place value-blindness is enforced.
 *
 * Every query that takes a `QueryScope` is re-exported here wrapped in
 * `redactMoney`, so a role that fails `can(role, "view", "rates")` receives a
 * payload with the monetary fields **removed** — not zeroed, not null, absent.
 * Adding a new query means adding it to this file, and it is guarded from its
 * first call. Nothing else in the app may import these modules directly.
 */
import type { Role } from "@/lib/domain";
import { redactMoney } from "./redaction";
import type { QueryScope } from "./types";

export * from "./types";
export * from "./scope";
export * from "./redaction";
export { usesMyRequests } from "./my-requests";

/* --- the raw implementations, never exported as-is --- */
import * as actionItems from "./action-items";
import * as certification from "./certification";
import * as flowCounts from "./flow-counts";
import * as header from "./header";
import * as myRequests from "./my-requests";
import * as projectHead from "./project-head";
import * as purchase from "./purchase";
import * as recordTrail from "./record-trail";
import * as search from "./search";
import * as siteEngineer from "./site-engineer";

export type * from "./action-items";
export type * from "./certification";
export type * from "./flow-counts";
export type * from "./header";
export type * from "./my-requests";
export type * from "./project-head";
export type * from "./purchase";
export type * from "./record-trail";
export type * from "./search";
export type * from "./site-engineer";

/** Wraps a scope-first query so its result is redacted for the calling role. */
function guarded<A extends unknown[], R>(
  fn: (scope: QueryScope, ...rest: A) => Promise<R>,
): (scope: QueryScope, ...rest: A) => Promise<R> {
  return async (scope, ...rest) => redactMoney(scope.role, await fn(scope, ...rest));
}

/** Wraps a query whose role arrives on its own rather than inside a scope. */
function guardedByRole<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  roleOf: (...args: A) => Role,
): (...args: A) => Promise<R> {
  return async (...args) => redactMoney(roleOf(...args), await fn(...args));
}

/* --- Needs your action --- */
export const getActionItems = guarded(actionItems.getActionItems);

/* --- Certification and the bill chain --- */
export const getQsKpis = guarded(certification.getQsKpis);
export const getApproverKpis = guarded(certification.getApproverKpis);
export const getCertificationPipeline = guarded(certification.getCertificationPipeline);
export const getStuckBills = guarded(certification.getStuckBills);
export const getContractorSummary = guarded(certification.getContractorSummary);
export const getPortfolioBudgetVsActual = guarded(certification.getPortfolioBudgetVsActual);

/* --- The live workflow chart --- */
export const getFlowCounts = guardedByRole(flowCounts.getFlowCounts, (_id, role) => role);
export const getProjectAlerts = guardedByRole(flowCounts.getProjectAlerts, (_id, role) => role);

/* --- The pinned project header --- */
export const getProjectHeaderStats = guarded(header.getProjectHeaderStats);

/* --- My Requests --- */
export const getMyRequests = guarded(myRequests.getMyRequests);
export const getSentBackCount = guarded(myRequests.getSentBackCount);

/* --- Project Head --- */
export const getProjectCards = guarded(projectHead.getProjectCards);
export const getProjectHeadKpis = guarded(projectHead.getProjectHeadKpis);
export const getOverBudgetLines = guarded(projectHead.getOverBudgetLines);
export const getWorkOrdersNearLimit = guarded(projectHead.getWorkOrdersNearLimit);
export const getIssuedVsMeasuredFlags = guarded(projectHead.getIssuedVsMeasuredFlags);

/* --- Purchase --- */
export const getPurchaseKpis = guarded(purchase.getPurchaseKpis);
export const getPurchaseHeadKpis = guarded(purchase.getPurchaseHeadKpis);
export const getOverduePos = guarded(purchase.getOverduePos);
export const getGrnsWithoutBill = guarded(purchase.getGrnsWithoutBill);
export const getPayablesBySupplier = guarded(purchase.getPayablesBySupplier);
export const getSpendByCategory = guarded(purchase.getSpendByCategory);
export const getL1Adherence = guarded(purchase.getL1Adherence);

/* --- The record trail --- */
export const getRecordTrail = guardedByRole(
  recordTrail.getRecordTrail,
  (_type, _id, role) => role,
);

/* --- Global search --- */
export const searchRecords = guarded(search.searchRecords);

/* --- Site Engineer --- */
export const getSiteEngineerKpis = guarded(siteEngineer.getSiteEngineerKpis);
export const getTodaysTasks = guarded(siteEngineer.getTodaysTasks);
export const getDprStreak = guarded(siteEngineer.getDprStreak);
export const getIndentPipeline = guarded(siteEngineer.getIndentPipeline);
export const getExpectedDeliveries = guarded(siteEngineer.getExpectedDeliveries);
export const getLowStockMaterials = guarded(siteEngineer.getLowStockMaterials);
