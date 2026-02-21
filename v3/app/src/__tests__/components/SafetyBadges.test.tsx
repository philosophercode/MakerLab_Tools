import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SafetyBadges from "@/components/SafetyBadges";

describe("SafetyBadges", () => {
  it("returns null when no safety conditions are set", () => {
    const { container } = render(
      <SafetyBadges
        ppe_required={[]}
        training_required={false}
        authorized_only={false}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders Authorization Required badge", () => {
    render(
      <SafetyBadges
        ppe_required={[]}
        training_required={false}
        authorized_only={true}
      />
    );
    expect(screen.getByText("Authorization Required")).toBeInTheDocument();
  });

  it("renders Training Required badge", () => {
    render(
      <SafetyBadges
        ppe_required={[]}
        training_required={true}
        authorized_only={false}
      />
    );
    expect(screen.getByText("Training Required")).toBeInTheDocument();
  });

  it("renders individual PPE items as badges", () => {
    render(
      <SafetyBadges
        ppe_required={["Safety Glasses", "Gloves", "Ear Protection"]}
        training_required={false}
        authorized_only={false}
      />
    );

    expect(screen.getByText("Safety Glasses")).toBeInTheDocument();
    expect(screen.getByText("Gloves")).toBeInTheDocument();
    expect(screen.getByText("Ear Protection")).toBeInTheDocument();
  });

  it("renders all badge types together in correct order", () => {
    render(
      <SafetyBadges
        ppe_required={["Gloves"]}
        training_required={true}
        authorized_only={true}
      />
    );

    const badges = screen.getAllByText(/.+/);
    const labels = badges.map((b) => b.textContent);

    // Authorization first, then Training, then PPE items
    expect(labels).toEqual([
      "Authorization Required",
      "Training Required",
      "Gloves",
    ]);
  });

  it("handles a single PPE item", () => {
    render(
      <SafetyBadges
        ppe_required={["Face Shield"]}
        training_required={false}
        authorized_only={false}
      />
    );

    expect(screen.getByText("Face Shield")).toBeInTheDocument();
  });
});
