import { AvalancheTechVerifier } from "@/components/opalx/opalx.avalanche-verifier";
import { ProjectRoadmapView } from "@/components/roadmap/roadmap.project-view";
import { OPALX_PROJECT_ROADMAP } from "@/core/opalx/opalx.roadmap-data";

export default function RoadmapPage() {
  return (
    <div className="space-y-6 pb-8">
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        <AvalancheTechVerifier defaultOpen />
      </div>
      <ProjectRoadmapView phases={OPALX_PROJECT_ROADMAP} />
    </div>
  );
}