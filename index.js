const express = require('express');
const app = express();
const cors = require("cors");
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);



// middlewear
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
    const WishlistCollection = DB.collection("Wishlist");

    //root route
    app.get('/', (req, res) => {
      res.send('Hello from LibrisGo Server')
    })

    // all books
    app.get("/AllBooks", async (req, res) => {
      const { skip = 0, limit = 0, sort = "name", order = "asc", search = "" } = req.query;

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

      res.send({ result, total: count });
    })


    // Add books
    app.post("/AllBooks", async (req, res) => {
      const newBook = req.body;
      const result = await AllBookCollection.insertOne({ ...newBook, createdAt: new Date() });
      res.send(result);
    });


    // get single book
    app.get("/AllBooks/:id", async (req, res) => {
      const id = req.params.id;
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

        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ error: "Payment failed" });
      }
    });

    // payment history
    app.get("/payment", async (req, res) => {
      const { id } = req.query;
      if (!id) {
        return res.status(400).send({ error: "id is required" });
      }
      const result = await PaymentHistory.findOne({ bookId: id })

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

    // cancle order and chnage 
    app.patch("/payment/cancel/:id", async (req, res) => {

      try {
        const { id } = req.params;

        const result = await PaymentHistory.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "canceled" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Order not found" });
        }

        res.send({ success: true, message: "Order canceled" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to cancel order" });
      }
    });

  
    // payment link
    app.post("/makePayment", async (req, res) => {
      try {
        const { finalPrice , Book , i , totalPrice} = req.body;

      
        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

       
        const session = await stripe.checkout.sessions.create({
          mode: "payment",

          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: Book,
                },
                unit_amount: Math.round(finalPrice * 10), 
              },
              quantity: 1,
            },
          ],

          metadata: {
            orderId: orderId,
            bookName: Book,
            id: i,
            price: totalPrice,
            date: new Date().toISOString(),
          },

          success_url: `${process.env.MY_DOMAIN}/PaySuccess?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.MY_DOMAIN}/payment/cancel`,
        });

        res.status(200).send({checkoutUrl: session.url, orderId, })
      } catch (error) {
        console.error("MAKE PAYMENT ERROR:", error);
        res.status(500).json({ error: "Order creation failed" });
      }
    });

    // payment verificatin
    app.patch("/verifyPayment", async (req,res)=>{
      const session_id = req.query.session_id;
      
      const session = await stripe.checkout.sessions.retrieve(session_id);
       

      const bookName = session.metadata.bookName; 
      const orderId = session.metadata.orderId;
      const price = session.metadata.price;
      const date = session.metadata.date;
      const Id = session.metadata.id;
      

      const data = { bookName, orderId , price, date }
      res.status(200).send(data)

       try {
      
        const result = await PaymentHistory.updateOne(
          { bookId: Id },
          { $set: { payment: "Paid" } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ error: "Payment not done" });
        }

        res.send({ success: true, message: "Payment Done" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update payment" });
      }

  });


  

    // add to the wishlist
    app.post("/Wishlist/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const findBook = await AllBookCollection.findOne({ _id: new ObjectId(id) });

        if (findBook) {
          const existing = await WishlistCollection.findOne({ _id: new ObjectId(id) });

          if (existing) {
            return res.status(200).json({ message: "Already in wishlist" });
          }

          await WishlistCollection.insertOne(findBook);
          res.status(200).send(findBook);
        } else {
          res.status(404).json({ message: "Book not found" });
        }
      } catch (error) {
        console.error("Exact error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });

    //  get my Wishlist
    app.get("/MyWishlist", async (req, res) => {
      const { email } = req.query;

      try {
        const books = await WishlistCollection.find({ email: email }).toArray();
        res.status(200).send(books);
      } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });

    //  remove from wishlist
    app.delete("/Wishlist/remove/:id", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await WishlistCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 1) {
          res.status(200).json({ message: "Removed from wishlist" });
        } else {
          res.status(404).json({ message: "Book not found in wishlist" });
        }
      } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ message: error.message });
      }
    });





    // error api
    app.all(/.*/, (req, res) => {
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
