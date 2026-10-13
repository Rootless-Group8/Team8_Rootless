import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import CostOfLivingPage from "./CostOfLivingPage";
import { get } from "firebase/database";

vi.mock("../firebase/config", () => ({
  rtdb: {},
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn((db, path) => path),
  get: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const COUNTRIES_SNAPSHOT = {
  exists: () => true,
  val: () => ({
    CA: { name: "Canada" },
    GB: { name: "United Kingdom" },
  }),
};

function mockCostOfLivingLookup(result) {
  // First call (component mount) resolves the countries list; second
  // call (destination select) resolves the cost-of-living lookup.
  get.mockResolvedValueOnce(COUNTRIES_SNAPSHOT).mockResolvedValueOnce(result);
}

describe("CostOfLivingPage", () => {
  it("shows the not-found state for a destination with no seeded data", async () => {
    mockCostOfLivingLookup({ exists: () => false, val: () => null });

    render(<CostOfLivingPage />);
    const user = userEvent.setup();

    const select = await screen.findByLabelText("Destination country");
    await user.selectOptions(select, "United Kingdom");

    expect(
      await screen.findByText(/Cost-of-living data isn't available yet for United Kingdom/),
    ).toBeInTheDocument();
  });

  it("renders a bar and amount for each numeric category", async () => {
    mockCostOfLivingLookup({
      exists: () => true,
      val: () => ({
        currency: "GBP",
        period: "month",
        categories: {
          rent: { amount: 820, note: "1-bed outside city centre", sourceUrl: "https://example.com" },
          utilities: { amount: 241, note: "Basic utilities", sourceUrl: "https://example.com" },
          transport: { amount: 77, note: "Monthly pass", sourceUrl: "https://example.com" },
          healthcare: { amount: 86, note: "IHS monthly equivalent", sourceUrl: "https://example.com" },
        },
      }),
    });

    render(<CostOfLivingPage />);
    const user = userEvent.setup();

    const select = await screen.findByLabelText("Destination country");
    await user.selectOptions(select, "United Kingdom");

    expect(await screen.findByText("GBP 820 / month")).toBeInTheDocument();
    expect(screen.getByText("GBP 241 / month")).toBeInTheDocument();
    expect(screen.getByText("GBP 77 / month")).toBeInTheDocument();
    expect(screen.getByText("GBP 86 / month")).toBeInTheDocument();
  });

  it("shows a 'not applicable' note instead of a bar when a category's amount is null", async () => {
    mockCostOfLivingLookup({
      exists: () => true,
      val: () => ({
        currency: "CAD",
        period: "month",
        categories: {
          rent: { amount: 1587, note: "1-bed outside city centre", sourceUrl: "https://example.com" },
          utilities: { amount: 210, note: "Basic utilities", sourceUrl: "https://example.com" },
          transport: { amount: 103, note: "Monthly pass", sourceUrl: "https://example.com" },
          healthcare: {
            amount: null,
            note: "Canada provides universal public healthcare.",
            sourceUrl: null,
          },
        },
      }),
    });

    render(<CostOfLivingPage />);
    const user = userEvent.setup();

    const select = await screen.findByLabelText("Destination country");
    await user.selectOptions(select, "Canada");

    expect(
      await screen.findByText(/Not applicable — Canada provides universal public healthcare\./),
    ).toBeInTheDocument();

    // No amount/currency line should render for the null category — this
    // would fail if the component tried to render "CAD null / month".
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });
});
