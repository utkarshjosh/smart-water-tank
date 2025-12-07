import Cookies from 'js-cookie';

const AUTH_TOKEN_COOKIE = 'auth_token';
const AUTH_TOKEN_EXPIRY_DAYS = 7; // Token expires in 7 days

export const setAuthToken = (token: string) => {
  // Store token in cookie with 7 days expiry
  Cookies.set(AUTH_TOKEN_COOKIE, token, {
    expires: AUTH_TOKEN_EXPIRY_DAYS,
    secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
    sameSite: 'strict',
  });
};

export const getAuthToken = (): string | undefined => {
  return Cookies.get(AUTH_TOKEN_COOKIE);
};

export const removeAuthToken = () => {
  Cookies.remove(AUTH_TOKEN_COOKIE);
};







