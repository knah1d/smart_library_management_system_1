import Loan from "../models/Loan.js";
import mongoose from "mongoose";
import { getUserById } from "../services/UserApi.js";
import { getBookById, updateBookAvailability } from "../services/BookApi.js";

// Create a new loan
export const createLoan = async (req, res) => {
    try {
        const { user_id, book_id, due_date } = req.body;

        // Set timeout for user service call
        const userTimeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error("User service call timed out")),
                process.env.USER_SERVICE_TIMEOUT || 3000
            );
        });

        // Get user with timeout protection
        const userPromise = getUserById(user_id);
        const user = await Promise.race([userPromise, userTimeoutPromise]);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Set timeout for book service call
        const bookTimeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error("Book service call timed out")),
                process.env.BOOK_SERVICE_TIMEOUT || 3000
            );
        });

        // Get book with timeout protection
        const bookPromise = getBookById(book_id);
        const book = await Promise.race([bookPromise, bookTimeoutPromise]);

        if (!book) {
            return res.status(404).json({ message: "Book not found" });
        }
        if (book.availableCopies <= 0) {
            return res
                .status(400)
                .json({ message: "Book is not available for loan" });
        }

        const loan = new Loan({
            user: user_id,
            book: book_id,
            dueDate: due_date,
        });

        // Set timeout for book availability update
        const updateTimeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error("Book availability update timed out")),
                process.env.BOOK_AVAILABILITY_TIMEOUT || 5000
            );
        });

        // Update book availability with timeout protection
        const updatePromise = updateBookAvailability(
            book_id,
            null,
            "decrement"
        );
        await Promise.race([updatePromise, updateTimeoutPromise]);

        await loan.save();

        res.status(201).json(loan);
    } catch (error) {
        console.error(`Error in createLoan: ${error.message}`);
        // Handle specific timeout errors
        if (error.message.includes("timed out")) {
            return res.status(503).json({
                message:
                    "Service temporarily unavailable, please try again later",
            });
        }
        // Handle book availability specific errors
        if (
            error.message.includes("Book is not available for loan") ||
            error.message.includes("No available copies")
        ) {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get details of a specific loan.
export const getLoanById = async (req, res) => {
    try {
        const { id } = req.params; // comes from /loans/:id
        const loan = await Loan.findById(id);
        if (!loan) {
            return res.status(404).json({ message: "Loan not found" });
        }
        const book = await getBookById(loan.book);
        const user = await getUserById(loan.user);
        if (!book || !user) {
            return res.status(404).json({ message: "Book or User not found" });
        }
        res.json({
            id: loan._id,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
            book: {
                id: book._id,
                title: book.title,
                author: book.author,
            },
            issue_date: loan.issueDate.toISOString(),
            due_date: loan.dueDate.toISOString(),
            return_date: loan.returnDate ? loan.returnDate.toISOString() : null,
            status: loan.status,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update loan details
export const updateLoan = async (req, res) => {
    try {
        const { id } = req.params; // comes from /loans/:id
        const { dueDate } = req.body;

        const updateData = {};
        if (dueDate) {
            updateData.dueDate = new Date(Date.parse(dueDate)); // Ensures proper date parsing

            // Check if the new due date makes the loan overdue
            if (updateData.dueDate < new Date()) {
                updateData.status = "OVERDUE";
            }
        }

        const updatedLoan = await Loan.findByIdAndUpdate(
            id,
            { $set: updateData },
            { new: true }
        );

        console.log("Updated Loan:", updatedLoan); // Log the updated loan

        if (!updatedLoan) {
            return res.status(404).json({ message: "Loan not found" });
        }

        res.json(updatedLoan);
    } catch (err) {
        console.error("Error updating loan:", err); // Log the error
        res.status(500).json({ message: err.message });
    }
};

// Return a book
export const returnBook = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { loan_id } = req.body;
        const loan = await Loan.findById(loan_id);

        if (!loan) {
            await session.abortTransaction();
            return res.status(404).json({ message: "Loan not found" });
        }

        if (!["ACTIVE", "OVERDUE"].includes(loan.status)) {
            await session.abortTransaction();
            return res
                .status(400)
                .json({ message: "Can only return active or overdue loans" });
        }
        loan.status = "RETURNED";
        loan.returnDate = new Date();
        await loan.save({ session });

        // Set timeout for book availability update
        const updateTimeoutPromise = new Promise((_, reject) => {
            setTimeout(
                () => reject(new Error("Book availability update timed out")),
                process.env.BOOK_AVAILABILITY_TIMEOUT || 5000
            );
        });

        // Update book availability with timeout protection
        const updatePromise = updateBookAvailability(
            loan.book,
            null,
            "increment"
        );

        try {
            await Promise.race([updatePromise, updateTimeoutPromise]);
            await session.commitTransaction();
            res.json(loan);
        } catch (updateError) {
            // If the update to book service fails, we need to rollback the transaction
            await session.abortTransaction();

            console.error(
                `Error updating book availability: ${updateError.message}`
            );
            if (updateError.message.includes("timed out")) {
                return res.status(503).json({
                    message:
                        "Book service temporarily unavailable, please try again later",
                });
            }
            throw updateError; // Rethrow to be caught by outer catch block
        }
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }

        console.error(`Error in returnBook: ${error.message}`);
        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
};

// Get user's loan history
export const getUserLoans = async (req, res) => {
    try {
        const loans = await Loan.find({ user: req.params.userId }).sort({
            issueDate: -1,
        });

        // Format loans to match the required response structure
        const formattedLoans = await Promise.all(
            loans.map(async (loan) => {
                // Default book details if service is unavailable
                let bookDetails = {
                    id: loan.book,
                    title: "Unknown (Service Unavailable)",
                    author: "Unknown (Service Unavailable)",
                };

                try {
                    // Set timeout for book service call
                    const bookTimeoutPromise = new Promise((_, reject) => {
                        setTimeout(
                            () =>
                                reject(
                                    new Error("Book service call timed out")
                                ),
                            process.env.BOOK_SERVICE_TIMEOUT || 3000
                        );
                    });

                    // Get book with timeout protection
                    const bookPromise = getBookById(loan.book);
                    const book = await Promise.race([
                        bookPromise,
                        bookTimeoutPromise,
                    ]);

                    if (book) {
                        bookDetails = {
                            id: book._id,
                            title: book.title,
                            author: book.author,
                        };
                    }
                } catch (error) {
                    console.error(
                        `Error fetching book details: ${error.message}`
                    );
                    // Continue with default book details on error
                }

                // Format the loan object to match the required structure
                return {
                    id: loan._id,
                    book: bookDetails,
                    issue_date: loan.issueDate.toISOString(),
                    due_date: loan.dueDate.toISOString(),
                    return_date: loan.returnDate
                        ? loan.returnDate.toISOString()
                        : null,
                    status: loan.status,
                };
            })
        );

        // Return the formatted response with total count
        res.json({
            loans: formattedLoans,
            total: formattedLoans.length,
        });
    } catch (error) {
        console.error(`Error in getUserLoans: ${error.message}`);
        res.status(500).json({ message: error.message });
    }
};

// Get overdue loans
export const getOverdueLoans = async (req, res) => {
    try {
        const now = new Date();
        const overdueLoans = await Loan.find({
            dueDate: { $lt: now },
            status: { $in: ["ACTIVE", "OVERDUE"] },
        }).sort({ dueDate: 1 });

        // Manually fetch user and book details with circuit breaker protection
        const formattedLoans = await Promise.all(
            overdueLoans.map(async (loan) => {
                const dueDate = new Date(loan.dueDate);
                const diffTime = Math.abs(now - dueDate);
                const daysOverdue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Fetch user details with timeout protection
                let userName = "Unknown (Service Unavailable)";
                let userEmail = "unknown@example.com";
                let userId = loan.user;

                try {
                    // Set timeout for user service call
                    const userTimeoutPromise = new Promise((_, reject) => {
                        setTimeout(
                            () =>
                                reject(
                                    new Error("User service call timed out")
                                ),
                            process.env.USER_SERVICE_TIMEOUT || 3000
                        );
                    });

                    // Get user with timeout protection
                    const userPromise = getUserById(loan.user);
                    const user = await Promise.race([
                        userPromise,
                        userTimeoutPromise,
                    ]);

                    if (user) {
                        userName = user.name;
                        userEmail = user.email;
                        userId = user._id;
                    }
                } catch (error) {
                    console.error(
                        `Error fetching user details: ${error.message}`
                    );
                    // Continue with default values on error
                }

                // Fetch book details with timeout protection
                let bookTitle = "Unknown (Service Unavailable)";
                let bookAuthor = "Unknown (Service Unavailable)";
                let bookId = loan.book;

                try {
                    // Set timeout for book service call
                    const bookTimeoutPromise = new Promise((_, reject) => {
                        setTimeout(
                            () =>
                                reject(
                                    new Error("Book service call timed out")
                                ),
                            process.env.BOOK_SERVICE_TIMEOUT || 3000
                        );
                    });

                    // Get book with timeout protection
                    const bookPromise = getBookById(loan.book);
                    const book = await Promise.race([
                        bookPromise,
                        bookTimeoutPromise,
                    ]);

                    if (book) {
                        bookTitle = book.title;
                        bookAuthor = book.author;
                        bookId = book._id;
                    }
                } catch (error) {
                    console.error(
                        `Error fetching book details: ${error.message}`
                    );
                    // Continue with default values on error
                }

                return {
                    id: loan._id,
                    user: {
                        id: userId,
                        name: userName,
                        email: userEmail,
                    },
                    book: {
                        id: bookId,
                        title: bookTitle,
                        author: bookAuthor,
                    },
                    issue_date: loan.issueDate.toISOString(),
                    due_date: loan.dueDate.toISOString(),
                    days_overdue: daysOverdue,
                };
            })
        );

        res.json(formattedLoans);
    } catch (error) {
        console.error(`Error in getOverdueLoans: ${error.message}`);
        res.status(500).json({ message: error.message });
    }
};

// Extend loan due date
export const extendLoan = async (req, res) => {
    try {
        const { extension_days } = req.body;

        if (!extension_days || isNaN(extension_days) || extension_days <= 0) {
            return res.status(400).json({ message: "Invalid extension days" });
        }

        const loan = await Loan.findById(req.params.id);

        if (!loan) {
            return res.status(404).json({ message: "Loan not found" });
        }

        if (!["ACTIVE", "OVERDUE"].includes(loan.status)) {
            return res
                .status(400)
                .json({ message: "Can only extend active or overdue loans" });
        }

        if (loan.extensionsCount >= 2) {
            return res
                .status(400)
                .json({ message: "Maximum number of extensions reached" });
        }

        const originalDueDate = loan.dueDate;
        const newDueDate = new Date(originalDueDate);
        newDueDate.setDate(
            originalDueDate.getDate() + parseInt(extension_days)
        );

        // Increment extensions count
        loan.extensionsCount += 1;
        loan.dueDate = newDueDate;
        loan.status = "ACTIVE";
        await loan.save();

        res.json({
            id: loan._id,
            user_id: loan.user,
            book_id: loan.book,
            issue_date: loan.issueDate.toISOString(),
            original_due_date: originalDueDate.toISOString(),
            extended_due_date: loan.dueDate.toISOString(),
            status: loan.status,
            extensions_count: loan.extensionsCount,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// For stats controller
export const getPopularBooksData = async (req, res) => {
    try {
        // Get the most borrowed books
        const popularBookIds = await Loan.aggregate([
            {
                $group: {
                    _id: "$book",
                    borrowCount: { $sum: 1 },
                },
            },
            {
                $sort: { borrowCount: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        // Manually fetch book details from book service
        const popularBooks = await Promise.all(
            popularBookIds.map(async (item) => {
                try {
                    const book = await getBookById(item._id);
                    return {
                        book_id: item._id,
                        title: book ? book.title : "Unknown",
                        author: book ? book.author : "Unknown",
                        borrow_count: item.borrowCount,
                    };
                } catch (error) {
                    console.error(
                        `Error fetching book details: ${error.message}`
                    );
                    return {
                        book_id: item._id,
                        title: "Unknown",
                        author: "Unknown",
                        borrow_count: item.borrowCount,
                    };
                }
            })
        );

        res.json(popularBooks);
    } catch (error) {
        res.status(500).json({
            message: `Error getting popular books: ${error.message}`,
        });
    }
};

// For stats controller
export const getActiveUsersData = async (req, res) => {
    try {
        // Get the most active users
        const activeUserIds = await Loan.aggregate([
            {
                $group: {
                    _id: "$user",
                    booksBorrowed: { $sum: 1 },
                    currentBorrows: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0],
                        },
                    },
                },
            },
            {
                $sort: { booksBorrowed: -1 },
            },
            {
                $limit: 10,
            },
        ]);

        // Manually fetch user details from user service
        const activeUsers = await Promise.all(
            activeUserIds.map(async (item) => {
                try {
                    const user = await getUserById(item._id);
                    return {
                        user_id: item._id,
                        name: user ? user.name : "Unknown",
                        books_borrowed: item.booksBorrowed,
                        current_borrows: item.currentBorrows,
                    };
                } catch (error) {
                    console.error(
                        `Error fetching user details: ${error.message}`
                    );
                    return {
                        user_id: item._id,
                        name: "Unknown",
                        books_borrowed: item.booksBorrowed,
                        current_borrows: item.currentBorrows,
                    };
                }
            })
        );

        res.json(activeUsers);
    } catch (error) {
        res.status(500).json({
            message: `Error getting active users: ${error.message}`,
        });
    }
};

// For stats controller
export const getLoanCountByStatus = async (req, res) => {
    try {
        const { status } = req.params;
        const count = await Loan.countDocuments({ status });
        res.json({ count });
    } catch (error) {
        res.status(500).json({
            message: `Error counting loans by status: ${error.message}`,
        });
    }
};

// For stats controller
export const getLoansToday = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await Loan.countDocuments({
            issueDate: { $gte: today },
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({
            message: `Error counting loans today: ${error.message}`,
        });
    }
};

// For stats controller
export const getReturnsToday = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const count = await Loan.countDocuments({
            returnDate: { $gte: today },
        });
        res.json({ count });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all loans with pagination
export const getAllLoans = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const loans = await Loan.find()
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Loan.countDocuments();

        res.json({
            loans,
            total,
            page,
            per_page: limit,
            total_pages: Math.ceil(total / limit),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
