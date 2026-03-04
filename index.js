const express = require('express');
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');


// middlewear
require('dotenv').config();
app.use(cors());
app.use(express.json());


const port = 3000;
const uri = `mongodb+srv://${process.env.Db_Username}:${process.env.Db_Password}@crud.7q5wtjc.mongodb.net/?appName=CRUD`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    
    // await client.connect();
    const DB = client.db("LibrisGo");
    const AllBookCollection = DB.collection("AllBooks");
    const PaymentHistory = DB.collection("Payment");

    //root route
    app.get('/', (req, res) => {
    res.send('Hello from LibrisGo Server')
    })

    // all books
    app.get("/AllBooks", async ( req , res ) => {
        const { skip = 0 , limit = 0 , sort = "name" , order = "asc" , search = ""} = req.query;

        const query = search ?
         {
            $or: [
              { bookName: { $regex: search, $options: "i" } },
              { author: { $regex: search, $options: "i" } }
               ]
            }
         :
         {}
      

        let sortQuery = {};

        if (sort === "name") {
          sortQuery = { bookName: order === "asc" ? 1 : -1 };
        } 
         else if (sort === "price") {
           sortQuery = { price: order === "asc" ? 1 : -1 };
        } 
         else if (sort === "rating") {
           sortQuery = { rating: order === "asc" ? 1 : -1 };
        }
        const result = await AllBookCollection.find(query)
        .sort(sortQuery)
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray();

        const count = await AllBookCollection.countDocuments();

        res.send({result , total:count});
    })



    // Add books
    app.post("/AllBooks" , async (req , res)=>{
        const newBook = req.body;
        const result = await AllBookCollection.insertOne({ ...newBook, createdAt: new Date() });
        res.send(result);
    });


    // get single book
    app.get("/AllBooks/:id", async (req , res )=> {
      const  id  = req.params.id;
      try {
        const book = await AllBookCollection.findOne({ _id: new ObjectId(id) });
        if (!book) {
      return res.status(404).json({ message: "Book not found" });
      }

      res.status(200).send(book);
      } catch (error) {
         res.status(400).json({ message: "Invalid book ID" });
      }
    })

    // payment  posting
      app.post("/payment", async (req, res) => {
          try {
            const paymentInfo = req.body;
            const result = await PaymentHistory.insertOne({
              bookId: paymentInfo.id,       
              email: paymentInfo.email,       
              author: paymentInfo.author,       
              phone: paymentInfo.phone,
              address: paymentInfo.address,
              url: paymentInfo.url,
              bookName: paymentInfo.bookName,
              price: paymentInfo.price,
              status: "pending",
              payment: "Unpaid",
              createdAt: new Date()
              });

            res.send({ success: true, insertedId: result.insertedId});
          } catch (error) {
              res.status(500).send({ error: "Payment failed" });
          }
      });

    // payment history
    app.get("/payment", async (req,res)=>{
      const {id} = req.query;
      if (!id) {
        return res.status(400).send({ error: "id is required" });
      }
      const result = await PaymentHistory.findOne({ bookId : id })
     
      res.status(200).send(result);
    });

    // My orders
    app.get("/MyOrders", async (req, res) => {
       try {
         const { e } = req.query;

         if (!e) {
          return res.status(400).send({ error: "email is required" });
          }

         const result = await PaymentHistory.find({ email: e }).toArray();  
         res.send(result);
        } catch (error) {
          console.error("MyOrders error:", error);
          res.status(500).send({ error: "Failed to fetch orders" });
        }
      });

    // calcle order and chnage 
    app.patch("/payment/cancel/:id", async (req, res) => {

          try {
             const { id } = req.params;

             const result = await PaymentHistory.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "canceled" } }
              );
              console.log(result)
            if (result.modifiedCount === 0) {
              return res.status(404).send({ error: "Order not found" });
            }

            res.send({ success: true, message: "Order canceled" });
          } catch (error) {
             console.error(error);
               res.status(500).send({ error: "Failed to cancel order" });
          }
    });

    // payment confermation
    app.patch("/payment/success/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await PaymentHistory.updateOne(
      { bookId: id },  
      { $set: { payment: "Paid" } }
    );

    console.log(id, result);

    if (result.modifiedCount === 0) {
      return res.status(404).send({ error: "Payment not done" });
    }

    res.send({ success: true, message: "Payment Done" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to update payment" });
  }
});


    // error api
    app.all(/.*/, (req,res)=>{
        res.status(404).json({
            status: 404,
            error: "Api Not Found"
        })
    })
    
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    
  }
}
run().catch(console.dir);


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
