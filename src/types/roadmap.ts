export type RoadmapPhaseStatus = "COMPLETED" | "IN_PROGRESS" | "PLANNED";

export interface RoadmapMilestone {
  id: string;
  title: string;
  ownerGateway: "ENTERPRISE" | "BANK" | "OPALX_CORE" | "CROSS_SYSTEM";
  deliverable: string;
  done: boolean;
}

export interface RoadmapPhase {
  phase: string;
  title: string;
  timeframe: string;
  status: RoadmapPhaseStatus;
  summary: string;
  milestones: RoadmapMilestone[];
}
