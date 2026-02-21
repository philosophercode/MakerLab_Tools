import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolCard from "@/components/ToolCard";
import type { ToolWithMeta } from "@/lib/types";

// Mock next/image — renders a plain <img>
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

function makeTool(overrides?: Partial<ToolWithMeta>): ToolWithMeta {
  return {
    id: "recTOOL1",
    name: "Prusa MK4S",
    description: "FDM 3D Printer for prototyping",
    category_group: "Digital Fabrication",
    category_sub: "3D Printers",
    location_room: "Design Lab",
    location_zone: "Zone A",
    materials: ["PLA", "PETG"],
    ppe_required: [],
    tags: [],
    authorized_only: false,
    training_required: false,
    use_restrictions: null,
    emergency_stop: null,
    safety_doc_url: null,
    sop_url: null,
    video_url: null,
    map_tag: null,
    image_url: null,
    image_attachments: [],
    manual_attachments: [],
    ...overrides,
  };
}

describe("ToolCard", () => {
  it("renders tool name and description", () => {
    render(<ToolCard tool={makeTool()} />);

    expect(screen.getByText("Prusa MK4S")).toBeInTheDocument();
    expect(
      screen.getByText("FDM 3D Printer for prototyping")
    ).toBeInTheDocument();
  });

  it("links to the tool detail page", () => {
    render(<ToolCard tool={makeTool()} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/tools/recTOOL1");
  });

  it("renders category group and location room badges", () => {
    render(<ToolCard tool={makeTool()} />);

    expect(screen.getByText("Digital Fabrication")).toBeInTheDocument();
    expect(screen.getByText("Design Lab")).toBeInTheDocument();
  });

  it("renders image when image_url is provided", () => {
    render(
      <ToolCard
        tool={makeTool({ image_url: "https://example.com/img.jpg" })}
      />
    );

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/img.jpg");
    expect(img).toHaveAttribute("alt", "Prusa MK4S");
  });

  it("renders 'No image' placeholder when image_url is null", () => {
    render(<ToolCard tool={makeTool({ image_url: null })} />);

    expect(screen.getByText("No image")).toBeInTheDocument();
  });

  it("renders PPE badge when ppe_required is non-empty", () => {
    render(
      <ToolCard tool={makeTool({ ppe_required: ["Safety Glasses"] })} />
    );

    expect(screen.getByText("PPE Required")).toBeInTheDocument();
  });

  it("renders Training badge when training_required is true", () => {
    render(<ToolCard tool={makeTool({ training_required: true })} />);

    expect(screen.getByText("Training")).toBeInTheDocument();
  });

  it("renders Auth Only badge when authorized_only is true", () => {
    render(<ToolCard tool={makeTool({ authorized_only: true })} />);

    expect(screen.getByText("Auth Only")).toBeInTheDocument();
  });

  it("does not render safety badges when none are needed", () => {
    render(
      <ToolCard
        tool={makeTool({
          ppe_required: [],
          training_required: false,
          authorized_only: false,
        })}
      />
    );

    expect(screen.queryByText("PPE Required")).not.toBeInTheDocument();
    expect(screen.queryByText("Training")).not.toBeInTheDocument();
    expect(screen.queryByText("Auth Only")).not.toBeInTheDocument();
  });

  it("renders all safety badges when all conditions are true", () => {
    render(
      <ToolCard
        tool={makeTool({
          ppe_required: ["Gloves"],
          training_required: true,
          authorized_only: true,
        })}
      />
    );

    expect(screen.getByText("PPE Required")).toBeInTheDocument();
    expect(screen.getByText("Training")).toBeInTheDocument();
    expect(screen.getByText("Auth Only")).toBeInTheDocument();
  });
});
