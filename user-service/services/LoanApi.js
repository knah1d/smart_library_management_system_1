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

const getActiveUsersDataFn = async () => {
    try {
        const response = await loanApiClient.get("/api/loans/active-users");
        return response.data;
    } catch (error) {
        throw new Error(`Error fetching active loans data: ${error.message}`);
    }
};

// Function to get active users data
export const getActiveUsersData = async () => {
    return getActiveUsersDataFn();
};

export const checkLoanServiceHealth = async () => {
    try {
        const response = await loanApiClient.get("/api/health");
        return response.data;
    } catch (error) {
        throw new Error(`Error checking loan service health: ${error.message}`);
    }
};

export default {
    getActiveUsersData,
    checkLoanServiceHealth,
};
