import Image from "next/image";
import type { ToolWithMeta } from "@/lib/types";

export default function ToolCard({ tool }: { tool: ToolWithMeta }) {
  const hasPPE = tool.ppe_required.length > 0;
  const needsAuth = tool.authorized_only;
  const needsTraining = tool.training_required;

  return (
    <a
      href={`/tools/${tool.id}`}
      className="group block rounded-xl border border-card-border bg-card-bg overflow-hidden transition-shadow hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative aspect-square bg-muted-bg">
        {tool.image_url ? (
          <Image
            src={tool.image_url}
            alt={tool.name}
            fill
            className="object-contain p-4 transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted text-sm">
            No image
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 group-hover:text-cornell-red transition-colors">
          {tool.name}
        </h3>
        <p className="mt-1 text-xs text-muted line-clamp-2">
          {tool.description}
        </p>

        {/* Category + Location */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-block rounded-full bg-muted-bg px-2 py-0.5 text-[11px] text-muted">
            {tool.category_group}
          </span>
          <span className="inline-block rounded-full bg-muted-bg px-2 py-0.5 text-[11px] text-muted">
            {tool.location_room}
          </span>
        </div>

        {/* Safety badges */}
        {(hasPPE || needsAuth || needsTraining) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {hasPPE && (
              <span className="inline-block rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning font-medium">
                PPE Required
              </span>
            )}
            {needsTraining && (
              <span className="inline-block rounded-full bg-cornell-red/10 px-2 py-0.5 text-[11px] text-cornell-red font-medium">
                Training
              </span>
            )}
            {needsAuth && (
              <span className="inline-block rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger font-medium">
                Auth Only
              </span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
