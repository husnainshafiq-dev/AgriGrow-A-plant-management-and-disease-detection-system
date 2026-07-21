import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MarketPrices from '../MarketPrices';

// Mock contexts
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ authHeaders: () => ({}), isAuthenticated: true })
}));

vi.mock('../../context/LanguageContext', () => ({
    useLanguage: () => ({ t: (key) => key })
}));

describe('MarketPrices', () => {
    beforeEach(() => {
        global.fetch = vi.fn((url) => {
            if (url.includes('/api/market/prices/latest')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: [] })
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
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders market prices component and fetches data', async () => {
        render(
            <BrowserRouter>
                <MarketPrices />
            </BrowserRouter>
        );

        expect(screen.getByText('market.title')).toBeInTheDocument();
        
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith('/api/market/prices/latest');
        });
    });
});
