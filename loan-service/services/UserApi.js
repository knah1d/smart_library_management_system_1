import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const USER_SERVICE_URL =
    process.env.USER_SERVICE_URL || "http://localhost:8081/api";

// Create an axios instance for user-service with improved timeout configuration
const userApiClient = axios.create({
    baseURL: USER_SERVICE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: process.env.API_TIMEOUT || 5000, // 5 second timeout default
});

// Base function for getting a user by ID
const getUserByIdFn = async (userId) => {
    try {
        const response = await userApiClient.get(`/users/${userId}`);
        return response.data;
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null;
        }
        throw new Error(`Error fetching user: ${error.message}`);
    }
};

// Function to get user by ID
export const getUserById = async (userId) => {
    return getUserByIdFn(userId);
};

// Health check function to verify user service is online
export const checkUserServiceHealth = async () => {
    try {
        const response = await userApiClient.get("/users?per_page=1");
        return { status: "ok", message: "User service is healthy" };
    } catch (error) {
        return {
            status: "error",
            message: `User service health check failed: ${error.message}`,
        };
    }
};

export default {
    getUserById,
    checkUserServiceHealth,
};
