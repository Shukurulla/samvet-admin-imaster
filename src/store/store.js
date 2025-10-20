// store/store.js
import { configureStore } from "@reduxjs/toolkit";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { createSlice } from "@reduxjs/toolkit";

// Auth slice
const authSlice = createSlice({
  name: "auth",
  initialState: {
    accessToken: localStorage.getItem("accessToken"),
    refreshToken: localStorage.getItem("refreshToken"),
    isAuthenticated: !!localStorage.getItem("accessToken"),
    user: null, // User ma'lumotlarini saqlash uchun
  },
  reducers: {
    setCredentials: (state, action) => {
      state.accessToken = action.payload.access;
      state.refreshToken = action.payload.refresh;
      state.isAuthenticated = true;
      state.user = action.payload.user || null;
      localStorage.setItem("accessToken", action.payload.access);
      localStorage.setItem("refreshToken", action.payload.refresh);
      if (action.payload.user?.role) {
        localStorage.setItem("userRole", action.payload.user.role);
      }
    },
    updateToken: (state, action) => {
      state.accessToken = action.payload.access;
      localStorage.setItem("accessToken", action.payload.access);
    },
    setUser: (state, action) => {
      state.user = action.payload;
      if (action.payload?.role) {
        localStorage.setItem("userRole", action.payload.role);
      }
    },
    logout: (state) => {
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.user = null;
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("userRole");
    },
  },
});

export const { setCredentials, updateToken, setUser, logout } =
  authSlice.actions;

// Base query with auto token refresh
const baseQueryWithReauth = async (args, api, extraOptions) => {
  const baseQuery = fetchBaseQuery({
    baseUrl: "https://imaster.kerek.uz/",
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth.accessToken;
      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }
      return headers;
    },
  });

  let result = await baseQuery(args, api, extraOptions);

  // If we get a 401 unauthorized error, try to refresh the token
  if (result?.error?.status === 401) {
    const refreshToken = api.getState().auth.refreshToken;

    if (refreshToken) {
      // Try to get a new token
      const refreshResult = await baseQuery(
        {
          url: "user/login/refresh/", // Corrected endpoint
          method: "POST",
          body: { refresh: refreshToken },
        },
        api,
        extraOptions
      );

      if (refreshResult?.data) {
        // Store the new token
        api.dispatch(updateToken({ access: refreshResult.data.access }));

        // Retry the original query with new token
        result = await baseQuery(args, api, extraOptions);
      } else {
        // Refresh failed - logout user
        api.dispatch(logout());
        window.location.href = "/login";
      }
    } else {
      // No refresh token - logout user
      api.dispatch(logout());
      window.location.href = "/login";
    }
  }

  return result;
};

// Base API
export const api = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "User",
    "University",
    "Building",
    "Faculty",
    "Room",
    "Equipment",
    "Floor",
    "Specification", // YANGI QO'SHILDI
    "Contract",
    "Repair",
  ],
  endpoints: () => ({}),
});

export const store = configureStore({
  reducer: {
    [api.reducerPath]: api.reducer,
    auth: authSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

// Token refresh interval (optional - refresh every 14 minutes)
let refreshInterval;

export const startTokenRefresh = () => {
  refreshInterval = setInterval(async () => {
    const state = store.getState();
    const refreshToken = state.auth.refreshToken;

    if (refreshToken) {
      try {
        const response = await fetch(
          "https://imaster.kerek.uz/user/login/refresh/",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ refresh: refreshToken }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          store.dispatch(updateToken({ access: data.access }));
        } else {
          // Refresh failed
          store.dispatch(logout());
          window.location.href = "/login";
        }
      } catch (error) {
        console.error("Token refresh failed:", error);
        store.dispatch(logout());
        window.location.href = "/login";
      }
    }
  }, 14 * 60 * 1000); // 14 minutes
};

export const stopTokenRefresh = () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
};
