import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Community from '../Community';

let currentUser = { id: 'farmer-1', name: 'Farmer One', email: 'farmer@agrigrow.com', role: 'farmer' };
let mockIsAuthenticated = true;

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        authHeaders: () => ({ Authorization: 'Bearer test-token' }),
        isAuthenticated: mockIsAuthenticated,
        user: currentUser
    })
}));

describe('Community Hub', () => {
    const mockPosts = [
        {
            _id: 'post-1',
            title: 'Managing Wheat Yellow Rust in Punjab',
            slug: 'managing-wheat-yellow-rust',
            category: 'disease-treatment',
            authorName: 'Dr. Tariq Mahmood',
            excerpt: 'Essential preventative steps for yellow rust during peak humidity.',
            content: 'Wheat yellow rust poses a recurring threat...',
            publishedAt: new Date().toISOString(),
            viewCount: 150,
            comments: [
                {
                    _id: 'comm-1',
                    authorName: 'Asim',
                    content: 'Applied fungicide last week, worked well.'
                }
            ]
        }
    ];

    const mockCategories = [
        { _id: 'cat-1', name: 'Disease Help', slug: 'disease-help', color: '#ef4444' },
        { _id: 'cat-2', name: 'General Farming', slug: 'general-farming', color: '#8b5cf6' }
    ];

    const mockThreads = [
        {
            _id: 'thread-1',
            title: 'Curled yellow leaves on chili plants',
            slug: 'curled-yellow-leaves-chili',
            category: { name: 'Disease Help', slug: 'disease-help', color: '#ef4444' },
            authorName: 'Noman Sahi',
            body: 'Noticed upper leaves curling downwards...',
            isSolved: true,
            replyCount: 2,
            guestUpvoteCount: 12,
            lastActivityAt: new Date().toISOString()
        }
    ];

    beforeEach(() => {
        global.fetch = vi.fn((url, options = {}) => {
            if (url.includes('/api/blog/posts/managing-wheat-yellow-rust')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { post: mockPosts[0] } })
                });
            }
            if (url.includes('/api/blog/posts')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { posts: mockPosts } })
                });
            }
            if (url.includes('/api/forum/categories')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { categories: mockCategories } })
                });
            }
            if (url.includes('/api/forum/threads/curled-yellow-leaves-chili')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        data: {
                            thread: mockThreads[0],
                            replies: [
                                {
                                    _id: 'rep-1',
                                    authorName: 'Dr. Tariq',
                                    body: 'Spray Abamectin immediately.',
                                    isSolution: true
                                }
                            ]
                        }
                    })
                });
            }
            if (url.includes('/api/forum/threads')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { threads: mockThreads } })
                });
            }
            if (url.includes('/api/blog/notifications')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ data: { notifications: [] } })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders the Community Hub hero, stats, and displays field guides', async () => {
        render(
            <BrowserRouter>
                <Community />
            </BrowserRouter>
        );

        expect(screen.getByText('AgriGrow Community Hub')).toBeInTheDocument();
        expect(screen.getAllByText(/Field Guides/i)[0]).toBeInTheDocument();
        expect(screen.getByText(/Active Farmer Network/i)).toBeInTheDocument();

        // Guide card should be displayed
        await waitFor(() => {
            expect(screen.getByText('Managing Wheat Yellow Rust in Punjab')).toBeInTheDocument();
            expect(screen.getByText('Dr. Tariq Mahmood')).toBeInTheDocument();
        });
    });

    it('switches to Discussion Forum tab and displays interactive threads', async () => {
        render(
            <BrowserRouter>
                <Community />
            </BrowserRouter>
        );

        const forumTab = await screen.findByRole('button', { name: /Discussion Forum/i });
        fireEvent.click(forumTab);

        await waitFor(() => {
            expect(screen.getByText('Curled yellow leaves on chili plants')).toBeInTheDocument();
            expect(screen.getByText('✓ Solved')).toBeInTheDocument();
        });
    });

    it('opens a field guide in the reader modal when clicked', async () => {
        render(
            <BrowserRouter>
                <Community />
            </BrowserRouter>
        );

        const guideCard = await screen.findByText('Managing Wheat Yellow Rust in Punjab');
        fireEvent.click(guideCard);

        await waitFor(() => {
            expect(screen.getByText(/Wheat yellow rust poses a recurring threat/i)).toBeInTheDocument();
            expect(screen.getByText(/Comments & Discussion/i)).toBeInTheDocument();
            expect(screen.getByText('Applied fungicide last week, worked well.')).toBeInTheDocument();
        });

        // Close modal
        const closeBtn = screen.getByText('✕');
        fireEvent.click(closeBtn);

        await waitFor(() => {
            expect(screen.queryByText(/Wheat yellow rust poses a recurring threat/i)).not.toBeInTheDocument();
        });
    });

    it('dynamically posts a comment and immediately updates the comment list and card counter', async () => {
        render(
            <BrowserRouter>
                <Community />
            </BrowserRouter>
        );

        const guideCard = await screen.findByText('Managing Wheat Yellow Rust in Punjab');
        fireEvent.click(guideCard);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/Add to this discussion.../i)).toBeInTheDocument();
        });

        // Mock comment post endpoint
        global.fetch.mockImplementation((url, options = {}) => {
            if (options.method === 'POST' && url.includes('/comments')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        data: {
                            comment: {
                                _id: 'comm-2',
                                authorName: 'Farmer One',
                                content: 'New dynamic comment for test.'
                            }
                        }
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: {} }) });
        });

        const textarea = screen.getByPlaceholderText(/Add to this discussion.../i);
        fireEvent.change(textarea, { target: { value: 'New dynamic comment for test.' } });

        const postBtn = screen.getByRole('button', { name: /Post Comment/i });
        fireEvent.click(postBtn);

        // Immediately visible in modal
        expect(screen.getByText('New dynamic comment for test.')).toBeInTheDocument();

        // Close modal
        const closeBtn = screen.getByText('✕');
        fireEvent.click(closeBtn);

        // On the guide card, comment counter should show 2 comments
        await waitFor(() => {
            expect(screen.getByText('💬 2')).toBeInTheDocument();
        });
    });

    it('shows login gate when user is logged out', async () => {
        mockIsAuthenticated = false;
        render(
            <BrowserRouter>
                <Community />
            </BrowserRouter>
        );

        expect(screen.getByText(/Log In to View Community/i)).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/Add to this discussion.../i)).not.toBeInTheDocument();
        mockIsAuthenticated = true;
    });
});
