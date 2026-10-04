import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MarketPrices from '../MarketPrices';

let currentUser = { id: 'farmer-1', email: 'farmer@agrigrow.com', role: 'farmer' };
let mockIsAuthenticated = true;

// Mock contexts
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({
        authHeaders: () => ({ Authorization: 'Bearer test-token' }),
        isAuthenticated: mockIsAuthenticated,
        user: currentUser
    })
}));

vi.mock('../../context/LanguageContext', () => ({
    useLanguage: () => ({ t: (key) => key })
}));

describe('MarketPrices', () => {
    const mockReportedPrices = [
        {
            _id: 'report-price-1',
            cropName: 'wheat',
            market: 'Sargodha Mandi',
            province: 'Punjab',
            price: { min: 4000, max: 4400, average: 4200, unit: 'per_40kg' },
            isVerified: false,
            moderationStatus: 'pending',
            date: new Date().toISOString(),
            submittedBy: { _id: 'farmer-1', name: 'Farmer One', email: 'farmer@agrigrow.com' }
        }
    ];

    beforeEach(() => {
        currentUser = { id: 'farmer-1', email: 'farmer@agrigrow.com', role: 'farmer' };

        global.fetch = vi.fn((url, options = {}) => {
            if (url.includes('/api/market/prices/latest')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] })
                });
            }
            if (url.includes('/api/market/my-prices')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: mockReportedPrices })
                });
            }
            if (url.includes('/api/market/moderation-queue')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: mockReportedPrices })
                });
            }
            if (url.includes('/api/market/prices/trends')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] })
                });
            }
            if (url.includes('/api/market/crops')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: ['wheat', 'cotton'] })
                });
            }
            if (url.includes('/api/market/mandis')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: ['Lahore Mandi'] })
                });
            }
            if (url.includes('/api/market/prices/crop/')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] })
                });
            }
            if (options.method === 'PATCH' && url.includes('/api/market/prices/report-price-1/approve')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, message: 'Market price approved and published to the app' })
                });
            }
            if (options.method === 'PATCH' && url.includes('/api/market/prices/report-price-1/reject')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, message: 'Market price submission has been rejected' })
                });
            }
            if (options.method === 'DELETE' && url.includes('/api/market/prices/report-price-1')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ success: true, message: 'Market price record deleted successfully.' })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });

        vi.spyOn(window, 'confirm').mockImplementation(() => true);
        vi.spyOn(window, 'prompt').mockImplementation(() => 'Inaccurate mandi rate');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders market prices and allows farmer to view reported rates with no delete button', async () => {
        currentUser = { id: 'farmer-1', email: 'farmer@agrigrow.com', role: 'farmer' };

        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        expect(screen.getByText('market.title')).toBeInTheDocument();

        // Switch to "My Reported Rates" tab
        const myReportsTab = await screen.findByRole('button', { name: /My Reported Rates/i });
        fireEvent.click(myReportsTab);

        // Verify the reported rate row is visible with pending badge
        await waitFor(() => {
            expect(screen.getByText('Sargodha Mandi')).toBeInTheDocument();
            expect(screen.getByText(/Pending Admin Approval/i)).toBeInTheDocument();
        });

        // Regular farmer MUST NOT see a delete button
        expect(screen.queryByRole('button', { name: /Delete/i })).not.toBeInTheDocument();
    });

    it('allows admin to approve, reject, and delete a reported market price', async () => {
        currentUser = { id: 'admin-1', email: 'admin@agrigrow.com', role: 'admin' };

        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        // Admin should see Moderation Queue tab
        const modTab = await screen.findByRole('button', { name: /Moderation Queue/i });
        expect(modTab).toBeInTheDocument();
        fireEvent.click(modTab);

        // Verify moderation row is displayed
        await waitFor(() => {
            expect(screen.getByText('Sargodha Mandi')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /✅ Approve/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /❌ Reject/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /🗑️ Delete/i })).toBeInTheDocument();
        });

        // Click Approve
        const approveBtn = screen.getByRole('button', { name: /✅ Approve/i });
        fireEvent.click(approveBtn);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/market/prices/report-price-1/approve',
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        // Click Reject
        const rejectBtn = screen.getByRole('button', { name: /❌ Reject/i });
        fireEvent.click(rejectBtn);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/market/prices/report-price-1/reject',
                expect.objectContaining({ method: 'PATCH' })
            );
        });

        // Click Delete
        const deleteBtn = screen.getByRole('button', { name: /🗑️ Delete/i });
        fireEvent.click(deleteBtn);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/market/prices/report-price-1',
                expect.objectContaining({ method: 'DELETE' })
            );
        });
    });

    it('refreshes prices when clicking the Refresh Prices button', async () => {
        currentUser = { id: 'farmer-1', email: 'farmer@agrigrow.com', role: 'farmer' };

        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        const refreshBtn = await screen.findByRole('button', { name: /Refresh Prices/i });
        expect(refreshBtn).toBeInTheDocument();
        expect(screen.getByText(/Updated:/i)).toBeInTheDocument();

        // Clear previous fetch calls
        global.fetch.mockClear();

        fireEvent.click(refreshBtn);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/market/prices/latest');
            expect(screen.getByText(/Market prices updated! Checked latest mandi logs./i)).toBeInTheDocument();
        });
    });

    it('allows admin to trigger live scraper with Sync Live AMIS button', async () => {
        currentUser = { id: 'admin-1', email: 'admin@agrigrow.com', role: 'admin' };

        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        const syncBtn = await screen.findByRole('button', { name: /Sync Live AMIS/i });
        expect(syncBtn).toBeInTheDocument();

        global.fetch.mockImplementation((url, options = {}) => {
            if (url.includes('/api/market/scrape-now') && options.method === 'POST') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ message: 'Live scrape complete', data: { unique: 5 } })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
        });

        fireEvent.click(syncBtn);

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/market/scrape-now',
                expect.objectContaining({ method: 'POST' })
            );
            expect(screen.getByText(/AMIS live sync complete! Scraped & verified 5 commodity rates./i)).toBeInTheDocument();
        });
    });

    it('limits initial displayed prices to 10 and expands with Show More button and collapses with Show Less', async () => {
        currentUser = { id: 'farmer-1', email: 'farmer@agrigrow.com', role: 'farmer' };

        const mockFifteenPrices = Array.from({ length: 15 }, (_, i) => ({
            _id: `price-${i + 1}`,
            cropName: 'wheat',
            market: `Mandi City ${i + 1}`,
            province: 'Punjab',
            price: { min: 3800, max: 4200, average: 4000, unit: 'per_40kg' },
            isVerified: true,
            moderationStatus: 'approved',
            date: new Date().toISOString()
        }));

        global.fetch.mockImplementation((url) => {
            if (url.includes('/api/market/prices/latest')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: mockFifteenPrices })
                });
            }
            if (url.includes('/api/market/crops')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: ['wheat'] }) });
            }
            if (url.includes('/api/market/mandis')) {
                return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
        });

        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        // Initial view should show 10 of 15 prices
        await waitFor(() => {
            expect(screen.getByText(/Showing/i)).toBeInTheDocument();
            expect(screen.getByText('Mandi City 2')).toBeInTheDocument();
            expect(screen.getByText('Mandi City 10')).toBeInTheDocument();
            expect(screen.queryByText('Mandi City 11')).not.toBeInTheDocument();
        });

        const showMoreBtn = screen.getByRole('button', { name: /Show More/i });
        expect(showMoreBtn).toBeInTheDocument();

        // Click Show More
        fireEvent.click(showMoreBtn);

        // All 15 should now be visible
        await waitFor(() => {
            expect(screen.getByText('Mandi City 11')).toBeInTheDocument();
            expect(screen.getByText('Mandi City 15')).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Show Less/i })).toBeInTheDocument();
        });

        // Click Show Less
        const showLessBtn = screen.getByRole('button', { name: /Show Less/i });
        fireEvent.click(showLessBtn);

        // Collapsed back to 10
        await waitFor(() => {
            expect(screen.queryByText('Mandi City 11')).not.toBeInTheDocument();
        });
    });

    it('shows login gate when user is logged out', async () => {
        mockIsAuthenticated = false;
        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        expect(screen.getByText(/Log In to View Market Prices/i)).toBeInTheDocument();
        expect(screen.queryByText(/Punjab Mandis/i)).not.toBeInTheDocument();
        mockIsAuthenticated = true;
    });
});

