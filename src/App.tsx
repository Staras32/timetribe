import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { pickTopMentors, type Profile as MatchProfile } from "./match";

async function startCheckout(plan: "1h" | "5h" | "10h" | "pass") {
  try {
    const res = await fetch(`/.netlify/functions/create-checkout-session?plan=${plan}`);
    const data = await res.json();
    if (data?.url) {
      window.location.assign(data.url); // 🔁 nukreipia į Stripe
    } else {
      alert("Nepavyko gauti Stripe nuorodos. Žr. Console.");
      console.log("Checkout response:", data);
    }
  } catch (err) {
    alert("Klaida jungiantis prie Stripe.");
    console.error(err);
  }
}


type Wallet = {
  user_id: string;
  earned_credits: number;
  purchased_credits: number;
  pass_active: boolean;
  pass_reset_at: string | null;
};

const Card: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
  <div className="p-5 rounded-2xl bg-gray-900 border border-gray-800">
    <div className="text-lg font-semibold">{title}</div>
    <div className="text-gray-400">{desc}</div>
  </div>
);

// 👉 Stripe checkout fetch + redirect (JSON -> window.location)
async function startCheckout(plan: "1h" | "5h" | "10h" | "pass") {
  try {
    const res = await fetch(`/.netlify/functions/create-checkout-session?plan=${plan}`);
    const data = await res.json();
    if (data?.url) {
      window.location.href = data.url;
    } else {
      alert("Nepavyko gauti Stripe nuorodos. Patikrink Netlify ENV kintamuosius.");
      console.log("Checkout response:", data);
    }
  } catch (err) {
    console.error(err);
    alert("Klaida jungiantis prie Stripe.");
  }
}

export default function App() {
  // Landing (waitlist)
  const [email, setEmail] = useState("");
  const [ok, setOk] = useState(false);

  // Auth/session
  const [session, setSession] = useState<any>(null);

  // Profilio formos laukai
  const [displayName, setDisplayName] = useState("");
  const [languages, setLanguages] = useState("");
  const [skills, setSkills] = useState("");

  // Wallet
  const [wallet, setWallet] = useState<Wallet | null>(null);

  // Matching
  const [recommended, setRecommended] = useState<MatchProfile[]>([]);

  // Rezervacija
  const [activeMentor, setActiveMentor] = useState<MatchProfile | null>(null);
  const [when, setWhen] = useState<string>("");

  // --- AUTH LISTEN ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      // apsauga nuo undefined
      try {
        sub?.subscription?.unsubscribe?.();
      } catch {}
    };
  }, []);

  // --- INIT PROFILE + WALLET ---
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const uid = session.user.id;

      // Profilis (užkrauti į formą)
      const { data: p } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (p) {
        setDisplayName(p.display_name || "");
        setLanguages((p.languages || []).join(","));
        setSkills((p.skills || []).join(","));
      }

      // Wallet (sukurti jei nėra, tada užkrauti)
      const { data: w } = await supabase.from("wallets").select("*").eq("user_id", uid).single();
      if (!w) {
        await supabase.from("wallets").insert({ user_id: uid });
        const { data: w2 } = await supabase.from("wallets").select("*").eq("user_id", uid).single();
        setWallet(w2 as Wallet);
      } else {
        setWallet(w as Wallet);
      }
    })();
  }, [session]);

  // --- WAITLIST SUBMIT ---
  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("waitlist").insert({ email });
    if (!error) setOk(true);
    else alert("Šis el. paštas jau įtrauktas arba įvyko klaida.");
  }

  // --- SAVE PROFILE ---
  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user?.id) return;
    const uid = session.user.id;
    const langs = languages.split(",").map((s) => s.trim()).filter(Boolean);
    const sks = skills.split(",").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, languages: langs, skills: sks })
      .eq("id", uid);
    if (!error) alert("Profilis išsaugotas ✅");
  }

  // --- MATCH MENTORS ---
  async function refreshMentors() {
    if (!session?.user?.id) return;
    const { data: me } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    const { data: mentors } = await supabase.from("profiles").select("*").in("role", ["mentor", "both"]);
    if (me && mentors?.length) {
      setRecommended(pickTopMentors(me as any, mentors as any, 5));
    } else {
      setRecommended([]);
    }
  }

  // --- BOOK SESSION w/ CREDIT CHECK ---
  async function bookSession() {
    if (!session?.user?.id || !activeMentor || !when) return;

    // 1) patikrink kreditus
    const { data: w } = await supabase.from("wallets").select("*").eq("user_id", session.user.id).single();
    const total = (w?.earned_credits || 0) + (w?.purchased_credits || 0);
    if (total < 1) {
      alert("Neturi kreditų. Paspausk „+5 test kred.“, tada rezervuok.");
      return;
    }

    // 2) nurašom (pirmiausia iš purchased)
    const spend = { purchased: 0, earned: 0 };
    if ((w?.purchased_credits || 0) >= 1) spend.purchased = 1;
    else spend.earned = 1;

    await supabase
      .from("wallets")
      .update({
        purchased_credits: (w?.purchased_credits || 0) - spend.purchased,
        earned_credits: (w?.earned_credits || 0) - spend.earned,
      })
      .eq("user_id", session.user.id);

    await supabase.from("transactions").insert({
      user_id: session.user.id,
      type: "spend",
      credits: 1,
      amount_eur: null,
      meta: { mentor_id: activeMentor.id },
    });

    // 3) sukurti sesiją
    const { error } = await supabase.from("sessions").insert({
      mentor_id: activeMentor.id,
      learner_id: session.user.id,
      scheduled_at: new Date(when).toISOString(),
      duration_min: 60,
      credits_charged: 1,
    });

    if (!error) {
      alert("Sesija užrezervuota ✅ (nurašytas 1 kreditas)");
      setActiveMentor(null);
      setWhen("");
      const { data: w2 } = await supabase.from("wallets").select("*").eq("user_id", session.user.id).single();
      setWallet(w2 as Wallet);
    } else {
      alert("Nepavyko rezervuoti.");
    }
  }

  // --- UIs ---
  if (!session) {
    // NOT LOGGED IN – Landing + Waitlist + Google login
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-5xl font-bold mb-4 text-red-500">TimeTribe</h1>
        <p className="text-xl text-gray-300 max-w-2xl mb-6">
          Mainyk laiką, ne pinigus. Arba įsigyk valandas mokymuisi.
        </p>

        {!ok ? (
          <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Įvesk el. paštą"
              className="flex-1 px-4 py-3 rounded-2xl bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button type="submit" className="rounded-2xl bg-red-600 hover:bg-red-700 px-6 py-3 text-lg">
              Prisijungti
            </button>
          </form>
        ) : (
          <p className="text-green-400 mt-4">Ačiū! Tu jau TimeTribe laukiančiųjų sąraše.</p>
        )}

        <div className="mt-6">
          <button
            onClick={() =>
              supabase.auth.signInWithOAuth({
                provider: "google",
                options: { redirectTo: window.location.origin },
              })
            }
            className="rounded-2xl bg-white text-black hover:bg-gray-200 px-6 py-3 text-lg"
          >
            Prisijungti su Google
          </button>
        </div>

        <div className="mt-10 grid sm:grid-cols-3 gap-4 max-w-4xl w-full">
          <Card title="Mainai" desc="1h už 1h — be pinigų" />
          <Card title="Learning Pass" desc="€9.99/mėn → 6 val." />
          <Card title="Top-Up" desc="Pirk 1h, 5h arba 10h kreditų" />
        </div>

        <footer className="mt-12 text-gray-500 text-sm">© 2025 TimeTribe | Sukurta kartu su GPT-5</footer>
      </div>
    );
  }

  // LOGGED IN – Profile + Wallet + Matching + Booking
  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-red-500">TimeTribe</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="px-4 py-2 rounded-xl bg-gray-800 border border-gray-700"
        >
          Atsijungti
        </button>
      </div>

      {/* Profilis */}
      <div className="mt-6 p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <h2 className="text-xl font-semibold mb-3">Tavo profilis</h2>
        <form onSubmit={saveProfile} className="grid gap-3">
          <label className="grid gap-1">
            <span className="text-gray-400">Vardas (rodoma kitiems)</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700"
              placeholder="Pvz., Jonas"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-400">Kalbos (kableliais)</span>
            <input
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
              className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700"
              placeholder="lt, en, ru"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-400">Įgūdžiai (kableliais)</span>
            <input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className="px-4 py-3 rounded-xl bg-gray-800 border border-gray-700"
              placeholder="excel, english, photoshop"
            />
          </label>
          <button className="mt-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700">Išsaugoti</button>
        </form>
      </div>

      {/* Wallet */}
      <div className="mt-6 p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Wallet</h2>
          <div className="flex flex-wrap gap-2">
            {/* Test kred. */}
            <button
              onClick={async () => {
                if (!session?.user?.id) return;
                const { data: w } = await supabase
                  .from("wallets")
                  .select("*")
                  .eq("user_id", session.user.id)
                  .single();
                await supabase
                  .from("wallets")
                  .update({
                    purchased_credits: (w?.purchased_credits || 0) + 5,
                  })
                  .eq("user_id", session.user.id);
                const { data: w2 } = await supabase
                  .from("wallets")
                  .select("*")
                  .eq("user_id", session.user.id)
                  .single();
                setWallet(w2 as Wallet);
                alert("Pridėta +5 testinių kreditų ✅");
              }}
              className="px-3 py-2 rounded-lg bg-gray-700 border border-gray-600"
            >
              +5 test kred.
            </button>

            {/* Stripe per JS redirect */}
            <div className="flex flex-wrap gap-2">
  <button onClick={() => startCheckout("1h")} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700">
    Pirkti 1h
  </button>
  <button onClick={() => startCheckout("5h")} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700">
    Pirkti 5h
  </button>
  <button onClick={() => startCheckout("10h")} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700">
    Pirkti 10h
  </button>
  <button onClick={() => startCheckout("pass")} className="px-3 py-2 rounded-lg bg-white text-black">
    Start Learning Pass
  </button>
</div>

        </div>

        <div className="grid grid-cols-2 gap-4 mt-3">
          <Stat label="Uždirbti kreditai" value={wallet?.earned_credits ?? 0} />
          <Stat label="Nupirkti kreditai" value={wallet?.purchased_credits ?? 0} />
          <Stat label="Learning Pass aktyvus" value={wallet?.pass_active ? "Taip" : "Ne"} />
        </div>
      </div>

      {/* Matching */}
      <div className="mt-6 p-5 rounded-2xl bg-gray-900 border border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">Rekomenduojami mentoriai</h2>
        <button
          onClick={refreshMentors}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700"
        >
          Atnaujinti
        </button>
        </div>

        {recommended.length ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {recommended.map((m) => (
              <div key={m.id} className="p-4 rounded-xl border border-gray-800 bg-gray-950">
                <div className="font-semibold">{m.display_name || "Mentorius"}</div>
                <div className="text-gray-400 text-sm">
                  Kalbos: {m.languages?.join(", ") || "—"}
                </div>
                <div className="text-gray-400 text-sm">
                  Įgūdžiai: {m.skills?.join(", ") || "—"}
                </div>
                <button
                  onClick={() => setActiveMentor(m)}
                  className="mt-2 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700"
                >
                  Rezervuoti 1h
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-gray-400">
            Kol kas nėra rekomendacijų — užpildyk kalbas ir įgūdžius, tada „Atnaujinti“.
          </div>
        )}
      </div>

      {/* Rezervacijos modalas */}
      {activeMentor && (
        <div className="fixed inset-0 bg-black/70 grid place-items-center p-6">
          <div className="w-full max-w-md p-5 rounded-2xl bg-gray-900 border border-gray-800">
            <div className="font-semibold mb-2">
              Rezervuoti: {activeMentor.display_name} (1h)
            </div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={bookSession}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700"
              >
                Patvirtinti
              </button>
              <button
                onClick={() => setActiveMentor(null)}
                className="px-4 py-2 rounded-xl bg-gray-800 border border-gray-700"
              >
                Atšaukti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-gray-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
