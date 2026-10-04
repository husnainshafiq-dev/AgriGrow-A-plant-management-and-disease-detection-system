import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminDashboard from '../AdminDashboard';

let currentUser = { _id: 'admin-1', email: 'admin@agrigrow.com', role: 'admin', name: 'Admin User' };

vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({
        authHeaders: () => ({ Authorization: 'Bearer test-token' }),
        isAuthenticated: true,
        user: currentUser,
    }),
}));

describe('AdminDashboard RBAC Tests', () => {
    const mockUsers = [
        { _id: 'user-1', name: 'Super Person', email: 'super@agrigrow.com', role: 'superadmin', isActive: true, createdAt: new Date().toISOString() },
        { _id: 'admin-1', name: 'Admin User', email: 'admin@agrigrow.com', role: 'admin', isActive: true, createdAt: new Date().toISOString() },
        { _id: 'user-2', name: 'Editor Person', email: 'editor@agrigrow.com', role: 'editor', isActive: true, createdAt: new Date().toISOString() },
        { _id: 'user-3', name: 'Farmer Person', email: 'farmer@agrigrow.com', role: 'farmer', isActive: true, createdAt: new Date().toISOString() },
    ];

    beforeEach(() => {
        global.fetch = vi.fn((url, options = {}) => {
            if (url.includes('/api/admin/users')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { users: mockUsers } }),
                });
            }
            if (url.includes('/api/admin/queries')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { queries: [] } }),
                });
            }
            if (url.includes('/api/blog/admin/posts')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { posts: [] } }),
                });
            }
            if (url.includes('/api/forum/admin/moderation')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { threads: [], replies: [], reports: [] } }),
                });
            }
            if (url.includes('/api/admin/disease-reports')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { reports: [] } }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ data: {} }),
            });
        });
    });

    it('renders Users tab for admin with Add User button and role controls', async () => {
        currentUser = { _id: 'admin-1', email: 'admin@agrigrow.com', role: 'admin', name: 'Admin User' };

        render(
            <BrowserRouter>
                <AdminDashboard />
            </BrowserRouter>
        );

        // Should see Users tab
        const usersTab = await screen.findByRole('button', { name: /Users/i });
        expect(usersTab).toBeInTheDocument();

        fireEvent.click(usersTab);

        // Should see Add User button
        expect(await screen.findByRole('button', { name: /Add User/i })).toBeInTheDocument();

        // Should list users
        expect(screen.getByText('Farmer Person')).toBeInTheDocument();
        expect(screen.getByText('Editor Person')).toBeInTheDocument();
    });

    it('hides Users tab for editor role and renders content moderation tabs', async () => {
        currentUser = { _id: 'user-2', email: 'editor@agrigrow.com', role: 'editor', name: 'Editor Person' };

        render(
            <BrowserRouter>
                <AdminDashboard />
            </BrowserRouter>
        );

        // Wait for render
        await waitFor(() => {
            expect(screen.getByText('✏️ Content Editor Dashboard')).toBeInTheDocument();
        });

        // Users tab must NOT exist for editor
        expect(screen.queryByRole('button', { name: /Users/i })).not.toBeInTheDocument();

        // But Queries, Blog Posts, Forum, and Disease Reports must exist
        expect(screen.getByRole('button', { name: /Queries/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Blog Posts/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Forum/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Disease Reports/i })).toBeInTheDocument();
    });

    it('allows superadmin full dashboard access with superadmin title', async () => {
        currentUser = { _id: 'user-1', email: 'super@agrigrow.com', role: 'superadmin', name: 'Super Person' };

        render(
            <BrowserRouter>
                <AdminDashboard />
            </BrowserRouter>
        );

        await waitFor(() => {
            expect(screen.getByText('👑 Super Admin Dashboard')).toBeInTheDocument();
        });

        // Users tab must exist
        expect(screen.getByRole('button', { name: /Users/i })).toBeInTheDocument();
    });
});
