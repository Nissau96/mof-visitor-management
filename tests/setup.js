import "@testing-library/jest-dom/vitest";
import {
  cleanup,
} from "@testing-library/react";
import {
  afterEach,
} from "vitest";

afterEach(() => {
  cleanup();
});
// jsdom does not implement scrollIntoView, which the Plex UI Select menu calls.
if (
  typeof Element !== "undefined" &&
  !Element.prototype.scrollIntoView
) {
  Element.prototype.scrollIntoView = () => {};
}
