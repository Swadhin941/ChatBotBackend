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

io.on('connection', (socket) => {
    console.log("Connection established");

    socket.on('testMessage', (data) => {
        console.log(data);
        io.sockets.emit('receiveMessage', data);
    })

    socket.on('disconnect', () => {
        console.log("Connection closed");
    })
})

const verifyJWT= (req, res, next)=>{
    const authHeader= req.headers.authorization;
    if(!authHeader){
        return res.status(401).send({message: "Unauthorize Access"});
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function(error, decoded){
        if(error){
            return res.status(401).send({message: "Unauthorize Access"});
        }
        req.decoded= decoded;
        next();
    })
}

const run = async () => {
    const Users = client.db("ChatBot").collection("Users");
    const AllMessages= client.db("ChatBot").collection("Messages");

    try {
        app.get('/', async (req, res) => {
            res.send('Running server');
        })

        app.post('/user', async (req, res) => {
            console.log(req.body);
            const result = await Users.insertOne(req.body);
            res.send(result);
        });

        app.post('/jwt', async (req, res) => {
            console.log(req.body);
            const email = req.body.email;
            const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1h" });
            res.send({ token });
        })

        app.get('/emailStatus', async(req, res)=>{
            const email = req.query.user;
            const result = await Users.findOne({email});
            console.log(result);
            if(result!== null){
                if(!result.emailStatus){
                    const filter = {email};
                    const updatedDoc= {
                        $set:{
                            emailStatus: true
                        }
                    };
                    const option = {upsert: true};
                    const UpdateResult = await Users.updateOne(filter, updatedDoc, option);
                }
            }
            if(!result){
                return res.status(401).send({message: "Unauthorize Access"});
            }
            else{
                return res.send({emailStatus: result?.emailStatus});
            }  
        })

        app.get('/allMessages', async(req, res)=>{
            const result = await AllMessages.find({}).toArray();
            res.send(result);
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