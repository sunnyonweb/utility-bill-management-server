// server/index.js
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// --- JWT Verification Middleware ---
const verifyToken = (req, res, next) => {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader) {
        return res.status(401).send({ message: 'Unauthorized access: No token provided' });
    }
    const token = authorizationHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.error('Token verification error:', err);
            return res.status(401).send({ message: 'Unauthorized access: Invalid token' });
        }
        req.decoded = decoded; 
        next();
    });
};

// --- MongoDB Connection Setup ---
// 🔑 UPDATED: Loading URI from the environment variable (DATABASE_URI)
const uri = process.env.DATABASE_URI;

// Check if URI is available
if (!uri) {
    console.error("FATAL: DATABASE_URI is not defined in the environment/dotenv file.");
    // Exit gracefully or continue, depending on deployment preference
}

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



async function run() {
    try {
        // Connect the client to the server 
        await client.connect(); 
        
        const db = client.db('utility_bill');
        const billsCollection = db.collection('bills');
        const myBillsCollection = db.collection('myBills');
        const usersCollection = db.collection('users');



        // 1. GET /bills/recent 
        app.get('/bills/recent', async (req, res) => {
            try {
                const cursor = billsCollection.find({}).sort({ date: -1 }).limit(6);
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching recent bills:', error);
                res.status(500).send({ message: 'Failed to fetch recent bills.' });
            }
        });

        // 2. GET /bills 
        app.get('/bills', async (req, res) => {
            const { category } = req.query;
            const query = category ? { category: category } : {};

            try {
                const cursor = billsCollection.find(query);
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching bills:', error);
                res.status(500).send({ message: 'Failed to fetch bills.' });
            }
        });

        // 3. GET /bills/:id (Single Bill Details)
        app.get('/bills/:id', async (req, res) => {
            const id = req.params.id;
            try {
                const query = { _id: new ObjectId(id) };
                const result = await billsCollection.findOne(query);
                if (!result) return res.status(404).send({ message: 'Bill not found.' });
                res.status(200).send(result);
            } catch (error) {
                res.status(400).send({ message: 'Invalid Bill ID format.' });
            }
        });
        
        // 4. POST /my-bills (Save Paid Bill Record)
        app.post('/my-bills', async (req, res) => {
            const paidBill = req.body;
            // NOTE: Add security check here if token is required for post
            if (!paidBill.email || !paidBill.billId || !paidBill.amount) {
                return res.status(400).send({ message: 'Missing mandatory fields for payment.' });
            }
            try {
                paidBill.billId = new ObjectId(paidBill.billId);
                const result = await myBillsCollection.insertOne(paidBill);
                res.status(201).send({ ...result, insertedId: result.insertedId });
            } catch (e) {
                return res.status(400).send({ message: 'Invalid Bill ID provided.' });
            }
        });

        // --- PRIVATE (SECURED) MY BILLS ENDPOINTS ---

        // 5. GET /my-bills/:email (User's Paid Bills - SECURED)
        app.get('/my-bills/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
            // Security Check: Enforce that the token owner matches the request email
            if (userEmail !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access: You can only view your own records.' });
            }
            const query = { email: userEmail };
            try {
                const cursor = myBillsCollection.find(query);
                const result = await cursor.toArray();
                res.status(200).send(result);
            } catch (error) {
                console.error('Error fetching paid bills for user:', error);
                res.status(500).send({ message: 'Failed to fetch user paid bills.' });
            }
        });

        // 6. PATCH /my-bills/:id (Update Paid Bill - SECURED)
        app.patch('/my-bills/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const { amount, address, phone, date } = req.body;
            
            try {
                const query = { _id: new ObjectId(id) };
                const existingBill = await myBillsCollection.findOne(query);
                if (!existingBill) return res.status(404).send({ message: 'Paid bill record not found.' });
                if (existingBill.email !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden access: You can only update your own records.' });
                }

                // Ensure data types are handled correctly (e.g., parsing date)
                const updateDoc = { $set: { amount, address, phone, date: new Date(date) } };
                const result = await myBillsCollection.updateOne(query, updateDoc);
                res.status(200).send({ message: 'Paid bill updated successfully.', modifiedCount: result.modifiedCount });
            } catch (error) {
                res.status(400).send({ message: 'Invalid ID or data provided.' });
            }
        });

        // 7. DELETE /my-bills/:id (Delete Paid Bill - SECURED)
        app.delete('/my-bills/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            try {
                const query = { _id: new ObjectId(id) };
                const existingBill = await myBillsCollection.findOne(query);
                if (!existingBill) return res.status(404).send({ message: 'Paid bill record not found.' });
                if (existingBill.email !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden access: You can only delete your own records.' });
                }

                const result = await myBillsCollection.deleteOne(query);
                res.status(200).send({ message: 'Paid bill record deleted successfully.' });
            } catch (error) {
                res.status(400).send({ message: 'Invalid ID format.' });
            }
        });
        
        // 8. GET /my-bills/summary/:email (Calculate Total Paid Bills & Amount - SECURED)
        // This addresses the "Total Bill Paid" requirement.
        app.get('/my-bills/summary/:email', verifyToken, async (req, res) => {
            const userEmail = req.params.email;
        
            if (userEmail !== req.decoded.email) {
                return res.status(403).send({ message: 'Forbidden access: You can only view your own summary.' });
            }
        
            try {
                const result = await myBillsCollection.aggregate([
                    { $match: { email: userEmail } },
                    {
                        $group: {
                            _id: null,
                            totalBillsPaid: { $sum: 1 }, 
                            totalAmountPaid: { $sum: "$amount" } 
                        }
                    }
                ]).toArray();
        
                // Send back totals, or zeros if no bills are found
                if (result.length > 0) {
                    res.status(200).send(result[0]);
                } else {
                    res.status(200).send({ _id: null, totalBillsPaid: 0, totalAmountPaid: 0 });
                }
            } catch (error) {
                console.error('Error fetching paid bill summary:', error);
                res.status(500).send({ message: 'Failed to fetch user paid bill summary.' });
            }
        });

        // --- AUTHENTICATION ENDPOINTS ---

        // 9. POST /users (Save/Register User for sync)
        app.post('/users', async (req, res) => {
            const user = req.body;
            const existingUser = await usersCollection.findOne({ email: user.email });
            if (existingUser) {
                return res.status(200).send({ message: 'User already exists', insertedId: existingUser._id });
            }
            
            const result = await usersCollection.insertOne(user);
            res.status(201).send({ ...result, insertedId: result.insertedId });
        });

        // 10. POST /jwt (Token Generation)
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            try {
                if (!user || !user.email) return res.status(400).send({ message: 'Email required for JWT generation.' });
                if (!process.env.ACCESS_TOKEN_SECRET) {
                    console.error("FATAL: ACCESS_TOKEN_SECRET is not set.");
                    return res.status(500).send({ message: 'Server configuration error (JWT secret missing).' });
                }
                const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
                res.send({ token });
            } catch (error) {
                console.error("JWT SIGNING FAILED:", error.message);
                res.status(500).send({ message: 'Failed to generate token on server. Check server console.' });
            }
        });


        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // You can remove this section if you want to keep the connection open 
        // throughout the server's lifecycle, which is typical for Express apps.
        // If you keep it, the connection will close when run() finishes.
        // await client.close(); 
    }
}
run().catch(console.dir);


// --- SERVER EXECUTION ---

app.get("/", (req, res) => {
    res.send("Utility Bill Management Server is running!");
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});