import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
import type { RoadmapPhase, RoadmapPhaseStatus } from "@/types";

function StatusBadge({ status }: { status: RoadmapPhaseStatus }) {
  if (status === "COMPLETED") {
    return (
      <span className="ox-badge-verified inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold">
        <CheckCircle2 className="h-3.5 w-3.5" />
        COMPLETED
      </span>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <span className="ox-badge-avax inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold">
        <Clock className="h-3.5 w-3.5" />
        IN PROGRESS
      </span>
    );
  }
  return (
    <span className="ox-subcard inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold text-[var(--ox-muted)]">
      <CircleDashed className="h-3.5 w-3.5" />
      PLANNED
    </span>
  );
}

function getDotClass(status: RoadmapPhaseStatus): string {
  if (status === "COMPLETED") return "border-[var(--ox-ok)] bg-[var(--ox-ok)]";
  if (status === "IN_PROGRESS") return "border-[var(--ox-avax)] bg-[var(--ox-avax)]";
  return "border-[var(--ox-line)] bg-[var(--ox-surface)]";
}

export function ProjectRoadmapView({ phases }: { phases: RoadmapPhase[] }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <div className="space-y-1.5">
        <span className="ox-badge-avax inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold">
          OpalX GO · Avalanche L1 Roadmap
        </span>
        <h1 className="text-2xl font-bold text-[var(--ox-ink)] sm:text-3xl">
          Project Roadmap (100% AVAX · Avalanche L1)
        </h1>
        <p className="text-sm text-[var(--ox-muted)]">
          Four-phase plan from 3 core Avalanche Fuji smart contracts to live PayOS NAPAS 247 rails and an enterprise Avalanche L1.
        </p>
      </div>

      <ol className="relative space-y-5 pl-7 before:absolute before:top-4 before:bottom-4 before:left-2.5 before:w-0.5 before:bg-[var(--ox-line)] sm:pl-9 sm:before:left-3.5">
        {phases.map((phase) => (
          <li key={phase.phase} className="relative">
            <span
              aria-hidden="true"
              className={`absolute top-6 -left-[25px] h-3.5 w-3.5 rounded-full border-2 shadow-sm sm:-left-[29px] ${getDotClass(phase.status)}`}
            />
            <section className="ox-card rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ox-line)] pb-3">
                <div>
                  <p className="font-mono text-xs text-[var(--ox-muted)]">
                    {phase.phase} · {phase.timeframe}
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-[var(--ox-ink)]">{phase.title}</h2>
                </div>
                <StatusBadge status={phase.status} />
              </div>

              <p className="mt-3 text-xs leading-relaxed text-[var(--ox-muted)]">{phase.summary}</p>

              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {phase.milestones.map((m) => (
                  <li key={m.id} className="ox-subcard rounded-xl p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[var(--ox-muted)]">
                        {m.id} · {m.ownerGateway}
                      </span>
                      <span className={m.done ? "font-bold text-[var(--ox-ok-ink)]" : "font-medium text-[var(--ox-muted)]"}>
                        {m.done ? "DONE" : "NEXT"}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-[var(--ox-ink)]">{m.title}</p>
                    <p className="mt-0.5 text-[var(--ox-muted)]">{m.deliverable}</p>
                  </li>
                ))}
              </ul>
            </section>
          </li>
        ))}
      </ol>
    </div>
  );
}
