import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const BOOK_SERVICE_URL =
    process.env.BOOK_SERVICE_URL || "http://localhost:8082/api";

// Create an axios instance for book-service with improved timeouts
const bookApiClient = axios.create({
    baseURL: BOOK_SERVICE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: process.env.API_TIMEOUT || 5000, // 5 second timeout default
});

// Base function for getting a book by ID
const getBookByIdFn = async (bookId) => {
    try {
        const response = await bookApiClient.get(`/books/${bookId}`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw new Error(`Error fetching book: ${error.message}`);
    }
};

// Function to get book by ID
export const getBookById = async (bookId) => {
    return getBookByIdFn(bookId);
};

// Base function for decreasing book availability
const decreaseBookAvailabilityFn = async (bookId) => {
    try {
        const response = await bookApiClient.patch(
            `/books/${bookId}/decrease-availability`
        );
        return response.data;
    } catch (error) {
        // Preserve the original error message from book service
        if (
            error.response &&
            error.response.data &&
            error.response.data.message
        ) {
            throw new Error(error.response.data.message);
        }
        throw new Error(`Error decreasing book availability: ${error.message}`);
    }
};

// Function to decrease book availability
export const decreaseBookAvailability = async (bookId) => {
    return decreaseBookAvailabilityFn(bookId);
};

// Base function for increasing book availability
const increaseBookAvailabilityFn = async (bookId) => {
    try {
        const response = await bookApiClient.patch(
            `/books/${bookId}/increase-availability`
        );
        return response.data;
    } catch (error) {
        // Preserve the original error message from book service
        if (
            error.response &&
            error.response.data &&
            error.response.data.message
        ) {
            throw new Error(error.response.data.message);
        }
        throw new Error(`Error increasing book availability: ${error.message}`);
    }
};

// Function to increase book availability
export const increaseBookAvailability = async (bookId) => {
    return increaseBookAvailabilityFn(bookId);
};

// Base function for updating book availability
const updateBookAvailabilityFn = async (bookId, availableCopies, operation) => {
    try {
        const response = await bookApiClient.patch(
            `/books/${bookId}/availability`,
            { available_copies: availableCopies, operation }
        );
        return response.data;
    } catch (error) {
        // Preserve the original error message from book service
        if (
            error.response &&
            error.response.data &&
            error.response.data.message
        ) {
            throw new Error(error.response.data.message);
        }
        throw new Error(`Error updating book availability: ${error.message}`);
    }
};

// Function to update book availability
export const updateBookAvailability = async (
    bookId,
    availableCopies,
    operation
) => {
    return updateBookAvailabilityFn(bookId, availableCopies, operation);
};

// Health check function to verify book service is online
export const checkBookServiceHealth = async () => {
    try {
        const response = await bookApiClient.get("/books?per_page=1");
        return { status: "ok", message: "Book service is healthy" };
    } catch (error) {
        return {
            status: "error",
            message: `Book service health check failed: ${error.message}`,
        };
    }
};

export default {
    getBookById,
    decreaseBookAvailability,
    increaseBookAvailability,
    updateBookAvailability,
    checkBookServiceHealth,
};
