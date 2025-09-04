import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const LOAN_SERVICE_URL =
    process.env.LOAN_SERVICE_URL || "http://localhost:8083/api";

// Create an axios instance for loan-service with improved timeout configuration
const loanApiClient = axios.create({
    baseURL: LOAN_SERVICE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: process.env.API_TIMEOUT || 5000, // 5 second timeout default
});

const getPopularBooksDataFn = async () => {
    try {
        const response = await loanApiClient.get("/loans/books/popular");
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching popular books data: ${error.message}`);
    }
};

// Function to get popular books data
export const getPopularBooksData = async () => {
    return getPopularBooksDataFn();
};

const getActiveUsersDataFn = async () => {
    try {
        const response = await loanApiClient.get("/loans/active-users");
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching active loans data: ${error.message}`);
    }
};

// Function to get active users data
export const getActiveUsersData = async () => {
    return getActiveUsersDataFn();
};

const getLoanCountByStatusFn = async (status) => {
    try {
        const response = await loanApiClient.get(`/loans/count`, {
            params: { status },
        });
        return response.data;
    } catch (error) {
        throw new Error(
            `Error fetching loan count by status: ${error.message}`
        );
    }
};

// Function to get loan count by status
export const getLoanCountByStatus = async (status) => {
    return getLoanCountByStatusFn(status);
};

const getLoansTodayFn = async () => {
    try {
        const response = await loanApiClient.get("/loans/today");
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching loans today: ${error.message}`);
    }
};

// Function to get loans today
export const getLoansToday = async () => {
    return getLoansTodayFn();
};

const getReturnsTodayFn = async () => {
    try {
        const response = await loanApiClient.get("/loans/returns/today");
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching returns today: ${error.message}`);
    }
};

// Function to get returns today
export const getReturnsToday = async () => {
    return getReturnsTodayFn();
};

export const checkLoanServiceHealth = async () => {
    try {
        const response = await loanApiClient.get("/health");
        return response.data;
    } catch (error) {
        throw new Error(`Error checking loan service health: ${error.message}`);
    }
};

export default {
    getPopularBooksData,
    getActiveUsersData,
    getLoanCountByStatus,
    getLoansToday,
    getReturnsToday,
    checkLoanServiceHealth,
};
