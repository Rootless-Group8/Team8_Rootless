// tests for ProgressBar
import { render, screen } from "@testing-library/react";
import ProgressBar from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders an accessible progressbar with the correct percent", () => {
    render(<ProgressBar completed={3} total={10} label="Checklist progress" />);

    const bar = screen.getByRole("progressbar", { name: "Checklist progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("shows a visible text label, not just an aria attribute", () => {
    render(<ProgressBar completed={3} total={10} label="Checklist progress" />);

    // The acceptance criteria explicitly require progress not be
    // communicated by the bar's color/width alone — this checks the
    // visible text a sighted user sees, separate from the aria value.
    expect(screen.getByText("3 of 10 steps complete (30%)")).toBeInTheDocument();
  });

  it("rounds the percentage rather than showing long decimals", () => {
    render(<ProgressBar completed={1} total={3} label="Progress" />);

    // 1/3 = 33.333...% — should round to a clean whole number, not
    // print a decimal in the visible label.
    expect(screen.getByText("1 of 3 steps complete (33%)")).toBeInTheDocument();
  });

  it("doesn't divide by zero when total is 0", () => {
    render(<ProgressBar completed={0} total={0} label="Progress" />);

    const bar = screen.getByRole("progressbar", { name: "Progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText("0 of 0 steps complete (0%)")).toBeInTheDocument();
  });
});
