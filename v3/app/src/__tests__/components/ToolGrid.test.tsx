import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolGrid from "@/components/ToolGrid";
import type { ToolWithMeta } from "@/lib/types";

// Mock next/image
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

function makeTool(id: string, name: string): ToolWithMeta {
  return {
    id,
    name,
    description: `Description for ${name}`,
    category_group: "CNC",
    category_sub: "Laser Cutters",
    location_room: "Workshop",
    location_zone: "Bay 1",
    materials: [],
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
  };
}

describe("ToolGrid", () => {
  it("renders empty state when no tools provided", () => {
    render(<ToolGrid tools={[]} />);

    expect(screen.getByText("No tools found")).toBeInTheDocument();
    expect(
      screen.getByText("Try adjusting your search or filters.")
    ).toBeInTheDocument();
  });

  it("renders a card for each tool", () => {
    const tools = [
      makeTool("rec1", "Laser Cutter"),
      makeTool("rec2", "3D Printer"),
      makeTool("rec3", "CNC Router"),
    ];

    render(<ToolGrid tools={tools} />);

    expect(screen.getByText("Laser Cutter")).toBeInTheDocument();
    expect(screen.getByText("3D Printer")).toBeInTheDocument();
    expect(screen.getByText("CNC Router")).toBeInTheDocument();
  });

  it("renders correct number of links", () => {
    const tools = [makeTool("rec1", "Tool A"), makeTool("rec2", "Tool B")];

    render(<ToolGrid tools={tools} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", "/tools/rec1");
    expect(links[1]).toHaveAttribute("href", "/tools/rec2");
  });

  it("does not render empty state when tools exist", () => {
    render(<ToolGrid tools={[makeTool("rec1", "A Tool")]} />);

    expect(screen.queryByText("No tools found")).not.toBeInTheDocument();
  });
});
