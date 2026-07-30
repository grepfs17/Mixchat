import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach } from "vitest";
import React, { useState } from "react";

/**
 * Integration test harness that mirrors the AppContainer sidebar structure:
 * - Always-rendered sidebar with data-sidebar-section attribute
 * - sidebar-collapsed class when closed
 * - X close button in .sidebar-close-btn-container
 * - Toggle button (sidebar-toggle-button--home)
 * - Grid template switches between "280px 1fr" and "0px 1fr"
 */

function MobileSidebarHarness({
  initialVisible = false,
}: {
  initialVisible?: boolean;
}) {
  const [leftColumnVisible, setLeftColumnVisible] = useState(initialVisible);

  return (
    <div
      className="main-layout"
      data-testid="app-layout"
      style={{
        display: "grid",
        gridTemplateColumns: leftColumnVisible ? "280px 1fr" : "0px 1fr",
        gap: "0",
        height: "100%",
        transition: "grid-template-columns 250ms ease",
      }}
    >
      <div
        data-sidebar-section
        data-testid="sidebar"
        className={leftColumnVisible ? "" : "sidebar-collapsed"}
      >
        {/* Mobile close button */}
        <div className="sidebar-close-btn-container">
          <button
            type="button"
            onClick={() => setLeftColumnVisible(false)}
            title="Close sidebar"
            data-testid="close-sidebar-btn"
          >
            X
          </button>
        </div>

        {/* Toggle button (shown in header when channel is selected) */}
        <button
          type="button"
          onClick={() => setLeftColumnVisible((v) => !v)}
          className="sidebar-toggle-button sidebar-toggle-button--home"
          title={leftColumnVisible ? "Close sidebar" : "Open sidebar"}
          data-testid="toggle-sidebar-btn"
        >
          {leftColumnVisible ? "◀" : "▶"}
        </button>
      </div>

      <div data-testid="main-content">Main content area</div>
    </div>
  );
}

describe("mobile sidebar open/close", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("sidebar DOM structure", () => {
    it("renders sidebar always in DOM (never conditionally removed)", async () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      expect(screen.getByTestId("sidebar")).toBeInTheDocument();

      // Close via X button: sidebar stays in DOM
      await userEvent.click(screen.getByTestId("close-sidebar-btn"));

      expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    });

    it("uses data-sidebar-section attribute for mobile CSS targeting", () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      // Boolean HTML attrs render as the string "true" in jsdom, not empty
      expect(
        screen.getByTestId("sidebar").getAttribute("data-sidebar-section"),
      ).toBe("true");
    });

    it("gets sidebar-collapsed class when closed via X button", async () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      expect(
        screen.getByTestId("sidebar").className,
      ).not.toContain("sidebar-collapsed");

      await userEvent.click(screen.getByTestId("close-sidebar-btn"));

      expect(
        screen.getByTestId("sidebar").className,
      ).toContain("sidebar-collapsed");
    });
  });

  describe("X close button", () => {
    it("renders inside .sidebar-close-btn-container", () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      const btn = screen.getByTestId("close-sidebar-btn");
      expect(btn.closest(".sidebar-close-btn-container")).not.toBeNull();
    });

    it("sets leftColumnVisible to false when clicked", async () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      expect(screen.getByTestId("sidebar").className).toBe("");

      await userEvent.click(screen.getByTestId("close-sidebar-btn"));

      expect(screen.getByTestId("sidebar").className).toBe(
        "sidebar-collapsed",
      );
    });
  });

  describe("toggle button", () => {
    it("renders with .sidebar-toggle-button--home class", () => {
      render(<MobileSidebarHarness initialVisible={false} />);

      expect(
        screen.getByTestId("toggle-sidebar-btn").className,
      ).toContain("sidebar-toggle-button--home");
    });

    it("opens sidebar when clicked while closed", async () => {
      render(<MobileSidebarHarness initialVisible={false} />);

      expect(screen.getByTestId("sidebar").className).toBe(
        "sidebar-collapsed",
      );

      await userEvent.click(screen.getByTestId("toggle-sidebar-btn"));

      expect(screen.getByTestId("sidebar").className).toBe("");
    });

    it("closes sidebar when clicked while open", async () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      expect(screen.getByTestId("sidebar").className).toBe("");

      await userEvent.click(screen.getByTestId("toggle-sidebar-btn"));

      expect(screen.getByTestId("sidebar").className).toBe(
        "sidebar-collapsed",
      );
    });
  });

  describe("grid template", () => {
    it("has main-layout class for reliable mobile CSS targeting", () => {
      render(<MobileSidebarHarness initialVisible={false} />);

      expect(screen.getByTestId("app-layout").className).toContain(
        "main-layout",
      );
    });

    it('uses "280px 1fr" when sidebar is open', () => {
      render(<MobileSidebarHarness initialVisible={true} />);

      expect(
        screen.getByTestId("app-layout").style.gridTemplateColumns,
      ).toBe("280px 1fr");
    });

    it('uses "0px 1fr" when sidebar is closed (for transition animation)', () => {
      render(<MobileSidebarHarness initialVisible={false} />);

      expect(
        screen.getByTestId("app-layout").style.gridTemplateColumns,
      ).toBe("0px 1fr");
    });

    it("has grid-template-columns transition for smooth animation", () => {
      render(<MobileSidebarHarness initialVisible={false} />);

      expect(
        screen.getByTestId("app-layout").style.transition,
      ).toContain("grid-template-columns");
    });
  });
});
