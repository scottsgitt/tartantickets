import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// Components call useRouter().refresh() after an order changes; there is no app router in jsdom.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
