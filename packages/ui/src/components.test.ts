import { describe, test, expect } from "bun:test";
import * as UI from "./index";

describe("UI component exports", () => {
  const expectedComponents = [
    "Button",
    "Input",
    "Card",
    "Stack",
    "Text",
    "Modal",
    "Badge",
    "Alert",
    "Avatar",
    "Tabs",
    "Select",
    "Textarea",
    "Spinner",
    "Tooltip",
    "Separator",
  ] as const;

  test("exports all expected components", () => {
    for (const name of expectedComponents) {
      expect(UI[name]).toBeDefined();
    }
  });

  test("exports exactly 15 components", () => {
    expect(Object.keys(UI).length).toBe(15);
  });

  test("all exports are functions", () => {
    for (const name of expectedComponents) {
      expect(typeof UI[name]).toBe("function");
    }
  });
});
