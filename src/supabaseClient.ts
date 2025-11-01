import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://czgmpmuoqbhdtgmnpyzh.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6Z21wbXVvcWJoZHRnbW5weXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5ODE1ODAsImV4cCI6MjA3NzU1NzU4MH0.L6lRJjNxmB6tfRdc9DP8Ej0pT6DOLV7iGUguBo7mf20";
export const supabase = createClient(supabaseUrl, supabaseKey);
