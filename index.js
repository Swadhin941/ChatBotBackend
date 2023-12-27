const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http');
const httpServer = http.createServer(app);
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
require('dotenv').config();
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', "POST"],
    },
});

//Mongodb Connection URL
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_NAME}:${process.env.DB_PASSWORD}@cluster0.wxzkvmx.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



app.use(cors());
app.use(express.json());



const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "Unauthorize Access" });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
        if (error) {
            return res.status(401).send({ message: "Unauthorize Access" });
        }
        req.decoded = decoded;
        next();
    })
}

io.use((socket, next)=>{
    if (Object.keys(socket.handshake.auth).length === 0) {
        const error = new Error("not_connected");
        error.data = { type: "not_connected" };
        next(error);
    }
    else {
        const authHeader = socket.handshake.auth.token;
        if (authHeader === null) {
            const error = new Error("empty_auth");
            error.data = { type: "authEmpty" };
            next(error);
        }
        const token = authHeader.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
            if (error) {
                const error = new Error('tokenError')
                error.data = { type: "tokenError" }
                next(error);
            }
            next();
        })
    }
})

const run = async () => {
    const Users = client.db("ChatBot").collection("Users");
    const AllMessages = client.db("ChatBot").collection("Messages");

    try {
        app.get('/', async (req, res) => {
            res.send('Running server');
        })

        app.post('/user', async (req, res) => {
            const email = req.body.email;
            const findEmail = await Users.findOne({email});
            if(findEmail){
                return res.send({acknowledged: true});
            }
            const result = await Users.insertOne(req.body);
            res.send(result);
        });

        app.put('/user', async (req, res) => {
            const email = req.query.user;
            const filter = { email: email };
            const updatedDoc = {
                $set: {
                    ...req.body
                }
            };
            const result = await Users.updateOne(filter, updatedDoc, { upsert: true });
            res.send(result);
        });

        app.post('/jwt', async (req, res) => {
            const email = req.body.email;
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1h" });
            res.send({ token });
        })

        app.get('/emailStatus', async (req, res) => {
            const email = req.query.user;
            const result = await Users.findOne({ email });
            if (result !== null) {
                if (!result.emailStatus) {
                    const filter = { email };
                    const updatedDoc = {
                        $set: {
                            emailStatus: true
                        }
                    };
                    const option = { upsert: true };
                    const UpdateResult = await Users.updateOne(filter, updatedDoc, option);
                }
            }
            if (!result) {
                return res.status(401).send({ message: "Unauthorize Access" });
            }
            else {
                return res.send({ emailStatus: result?.emailStatus });
            }
        })

        app.get('/allMessages', verifyJWT, async (req, res) => {
            const email = req.decoded.email;
            if(req.query.user!== req.decoded.email){
                return res.status(401).send({ message: "Unauthorize Access" });
            }
            const result = await AllMessages.find({ $or: [{ sender: { $eq: email } }, { receiver: { $eq: email } }] }).toArray();
            res.send(result);
        })

        io.on('connection', (socket) => {
            console.log("Connection established");

            socket.on('personMessage', async (data, callBack) => {
                console.log(data);
                const authHeader= data.token;
                if(!authHeader){
                    callBack({
                        status: "Unauthenticated"
                    })
                    return;
                }
                const token= data.token.split(' ')[1];
                jwt.verify(token, process.env.ACCESS_TOKEN, async function(error, decoded){
                    if(error){
                        callBack({
                            status: "Unauthenticated"
                        })
                        return;
                    }
                    else{
                        const result = await AllMessages.insertOne({ ...data })
                        if (result.acknowledged) {
                            const newData = await AllMessages.find({ $or: [{ sender: { $eq: data.sender } }, { receiver: { $eq: data.sender } }] }
                            ).toArray();
                            callBack({
                                status: "success",
                                data: newData
                            })
                        }
                    }
                })
                


            })

            socket.on("assistantMessage", async (data, callBack) => {
                const authHeader = data.token;
                if (!authHeader) {
                    callBack({
                        status: "Unauthenticated"
                    })
                    return;
                }
                const token = data.token.split(' ')[1];
                jwt.verify(token, process.env.ACCESS_TOKEN, async function (error, decoded) {
                    if (error) {
                        callBack({
                            status: "Unauthenticated"
                        })
                        return;
                    }
                    else {
                        const result = await AllMessages.insertOne(data)
                        if (result.acknowledged) {
                            const newData = await AllMessages.find({ $or: [{ sender: { $eq: data.receiver } }, { receiver: { $eq: data.receiver } }] }
                            ).toArray();
                            callBack({
                                status: "success",
                                data: newData
                            })
                        }
                    }
                })
                
            })

            socket.on('disconnect', () => {
                console.log("Connection closed");
            })
        })


    }
    finally {

    }
}
run()
    .catch(error => {
        console.log(error.message);
    })



httpServer.listen(port, () => {
    console.log('listening on port ' + port);
})