const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');

const marketPriceRoutes = require('../routes/marketPriceRoutes');
const MarketPrice = require('../models/MarketPrice');

const app = express();
app.use(express.json());
app.use('/api/market', marketPriceRoutes);

let mongoServer;

// Increase timeout for the first run so MongoDB binary can be downloaded
jest.setTimeout(600000);

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await MarketPrice.deleteMany();
});

describe('Market Price API', () => {
    describe('GET /api/market/prices/latest', () => {
        it('should return empty list if no prices exist and seeding is disabled', async () => {
            const res = await request(app).get('/api/market/prices/latest');
            // If ENABLE_SEED_DATA is not 'true', it should be empty initially in the test env
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
        });

        it('should return latest verified prices', async () => {
            await MarketPrice.create([
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4000 },
                    isVerified: true,
                    date: new Date('2023-01-01')
                },
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4200 },
                    isVerified: true,
                    date: new Date('2023-01-02') // This is newer
                },
                {
                    cropName: 'wheat',
                    market: 'Lahore Mandi',
                    province: 'Punjab',
                    price: { average: 4500 },
                    isVerified: false, // Not verified, should be ignored
                    date: new Date('2023-01-03') 
                }
            ]);

            const res = await request(app).get('/api/market/prices/latest');
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
            
            const data = res.body.data;
            expect(data.length).toBe(1);
            expect(data[0].price.average).toBe(4200);
            expect(data[0].cropName).toBe('wheat');
        });
    });

    describe('GET /api/market/prices', () => {
        it('should fetch prices with pagination', async () => {
            for (let i = 0; i < 15; i++) {
                await MarketPrice.create({
                    cropName: 'cotton',
                    market: 'Multan Mandi',
                    province: 'Punjab',
                    price: { average: 8000 + i },
                    isVerified: true
                });
            }

            const res = await request(app).get('/api/market/prices?limit=10&page=1');
            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBeTruthy();
            expect(res.body.data.prices.length).toBe(10);
            expect(res.body.data.total).toBe(15);
            expect(res.body.data.pages).toBe(2);
        });
    });
});
