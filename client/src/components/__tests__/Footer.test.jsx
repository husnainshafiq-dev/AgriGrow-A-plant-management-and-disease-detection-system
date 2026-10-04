import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Footer from "../Footer";
import { LanguageProvider } from "../../context/LanguageContext";

describe("Footer Component", () => {
    it("renders footer brand and technical description", () => {
        render(
            <MemoryRouter initialEntries={["/"]}>
                <LanguageProvider>
                    <Footer isOnline={true} isModelLoaded={false} />
                </LanguageProvider>
            </MemoryRouter>
        );

        expect(screen.getByText("AgriGrow")).toBeInTheDocument();
        expect(screen.getByText(/28-class classifier/i)).toBeInTheDocument();
        expect(screen.getByText("Designed for sustainable farming.")).toBeInTheDocument();
    });

    it("applies dashboard-footer class when on /dashboard route", () => {
        const { container } = render(
            <MemoryRouter initialEntries={["/dashboard"]}>
                <LanguageProvider>
                    <Footer isOnline={true} isModelLoaded={false} />
                </LanguageProvider>
            </MemoryRouter>
        );

        const footer = container.querySelector("footer");
        expect(footer).toHaveClass("dashboard-footer");
        expect(footer).toHaveClass("landing-footer");
    });

    it("displays offline indicator when offline and model is loaded", () => {
        render(
            <MemoryRouter initialEntries={["/dashboard"]}>
                <LanguageProvider>
                    <Footer isOnline={false} isModelLoaded={true} />
                </LanguageProvider>
            </MemoryRouter>
        );

        expect(screen.getByText("📡 Offline Mode Active")).toBeInTheDocument();
    });
});
