import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Navbar from "../Navbar";
import { AuthProvider } from "../../context/AuthContext";
import { LanguageProvider } from "../../context/LanguageContext";

vi.mock("../../context/AuthContext", () => ({
    AuthProvider: ({ children }) => children,
    useAuth: () => ({
        isAuthenticated: false,
        user: null,
        logout: vi.fn(),
    }),
}));

describe("Navbar Component", () => {
    const renderNavbar = () => {
        return render(
            <MemoryRouter>
                <LanguageProvider>
                    <Navbar modelReady={true} isOnline={true} />
                </LanguageProvider>
            </MemoryRouter>
        );
    };

    it("renders brand logo and navigation container", () => {
        renderNavbar();
        expect(screen.getByText("AgriGrow")).toBeInTheDocument();
        expect(screen.getByLabelText("Toggle Menu")).toBeInTheDocument();
    });

    it("toggles mobile drawer when hamburger button is clicked", () => {
        renderNavbar();
        const hamburger = screen.getByLabelText("Toggle Menu");
        expect(hamburger).not.toHaveClass("open");

        fireEvent.click(hamburger);
        expect(hamburger).toHaveClass("open");
        expect(document.querySelector(".nav-mobile-drawer")).toBeInTheDocument();

        fireEvent.click(hamburger);
        expect(hamburger).not.toHaveClass("open");
        expect(document.querySelector(".nav-mobile-drawer")).not.toBeInTheDocument();
    });
});
