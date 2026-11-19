import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
  MessageSquareText,
  Phone,
  RotateCcw,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import Field from "./Field.jsx";
import { IconInput, StepButton } from "./VisitorFlow.jsx";
import { ApiError, apiRequest } from "../lib/api.js";
import { formatCountdown } from "../hooks/useCountdown.js";
import {
  returningVisitorCodeSchema,
  returningVisitorLookupSchema,
} from "../validation/returningVisitor.js";

// Returning visitors find their record with the number from their
// first visit. When the server has SMS codes switched on, a code sent
// to that number must be entered too; the confirmation is then worded
// the same whether or not the number is registered. With codes off,
// the number alone finds the record.

function errorText(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function digitsOnly(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function useSecondsUntil(deadline) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline || deadline <= Date.now()) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);

      if (current >= deadline) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [deadline]);

  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function HelpLinks({ smsCodes }) {
  return (
    <div className="grid gap-1 text-sm leading-6 text-slate-700">
      <p>
        <span className="font-semibold text-slate-900">
          {smsCodes ? "Can’t get the code?" : "Need help?"}
        </span>{" "}
        Ask reception for help.
      </p>
      <p>
        First visit?{" "}
        <Link
          className="inline-flex items-center gap-1 font-bold text-brand-800 underline decoration-2 underline-offset-2"
          to="/visit/new"
        >
          Register here
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </p>
    </div>
  );
}

function Problem({ children, title }) {
  return (
    <div
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900"
      role="alert"
    >
      <p className="font-bold">{title}</p>
      <p className="mt-1">{children}</p>
    </div>
  );
}

export default function ReturningCodeLookup({
  initialPhone = "",
  onProgress,
  onVerified,
}) {
  const ids = useId();
  const phoneId = `${ids}-phone`;
  const codeId = `${ids}-code`;

  const [phone, setPhone] = useState(initialPhone);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState("");
  const [fieldError, setFieldError] = useState({ code: "", phone: "" });
  const [problem, setProblem] = useState(null);
  // null while loading, then whether the server uses SMS codes.
  const [smsCodes, setSmsCodes] = useState(null);
  const [modeError, setModeError] = useState(false);
  const [modeAttempt, setModeAttempt] = useState(0);

  const resendIn = useSecondsUntil(sent?.resendAt);
  const phoneReady = phone.replace(/\D/g, "").length >= 9;

  useEffect(() => {
    const controller = new AbortController();

    apiRequest("/api/returning/verify?operation=mode", {
      method: "GET",
      signal: controller.signal,
    })
      .then((response) => {
        setSmsCodes(response?.smsCodes === true);
        setModeError(false);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") {
          setModeError(true);
        }
      });

    return () => controller.abort();
  }, [modeAttempt]);

  useEffect(() => {
    onProgress?.(
      smsCodes
        ? { done: Number(Boolean(sent)) + Number(code.length === 6), total: 2 }
        : { done: Number(phoneReady), total: 1 },
    );
  }, [code.length, onProgress, phoneReady, sent, smsCodes]);

  // Codes off: the number alone finds the record.
  async function findRecord(parsedPhone) {
    try {
      const response = await apiRequest("/api/returning/verify", {
        body: JSON.stringify({ phone: parsedPhone }),
        method: "POST",
      });

      if (!response?.profile?.fullName || !response?.verificationToken) {
        throw new Error("Your record could not be found. Please try again.");
      }

      onVerified(response, phone);
    } catch (error) {
      const notFound = error instanceof ApiError && error.status === 400;

      setProblem({
        message: errorText(error, "Your record could not be found. Please try again."),
        title: notFound ? "Record not found" : "Lookup unavailable",
      });
    }
  }

  async function sendCode(event) {
    event?.preventDefault();
    setProblem(null);

    const parsed = returningVisitorLookupSchema.safeParse({ phone });

    if (!parsed.success) {
      setFieldError({ code: "", phone: parsed.error.issues[0].message });
      document.getElementById(phoneId)?.focus();
      return;
    }

    setFieldError({ code: "", phone: "" });
    setBusy("send");

    if (!smsCodes) {
      await findRecord(parsed.data.phone);
      setBusy("");
      return;
    }

    try {
      const response = await apiRequest("/api/returning/send-code", {
        body: JSON.stringify(parsed.data),
        method: "POST",
      });

      setSent({
        maskedPhone: response.maskedPhone || phone,
        phone: parsed.data.phone,
        resendAt: Date.now() + (Number(response.resendAfterSeconds) || 60) * 1000,
      });
      setCode("");

      requestAnimationFrame(() => document.getElementById(codeId)?.focus());
    } catch (error) {
      const unavailable = error instanceof ApiError && error.status === 503;

      setProblem({
        message: errorText(error, "The code could not be sent. Please try again."),
        title: unavailable ? "Returning check-in unavailable" : "Code not sent",
      });
    } finally {
      setBusy("");
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    setProblem(null);

    const parsed = returningVisitorCodeSchema.safeParse({ code, phone: sent.phone });

    if (!parsed.success) {
      setFieldError({ code: parsed.error.issues[0].message, phone: "" });
      document.getElementById(codeId)?.focus();
      return;
    }

    setFieldError({ code: "", phone: "" });
    setBusy("verify");

    try {
      const response = await apiRequest("/api/returning/verify", {
        body: JSON.stringify(parsed.data),
        method: "POST",
      });

      if (!response?.profile?.fullName || !response?.verificationToken) {
        throw new Error("Your record could not be found. Please try again.");
      }

      // The number as the visitor typed it, for going back a step.
      onVerified(response, phone);
    } catch (error) {
      const message = errorText(error, "The code could not be checked. Please try again.");

      if (error instanceof ApiError && error.status === 400) {
        setFieldError({ code: message, phone: "" });
        setCode("");
        document.getElementById(codeId)?.focus();
      } else {
        setProblem({ message, title: "Code not checked" });
      }
    } finally {
      setBusy("");
    }
  }

  function changeNumber() {
    setSent(null);
    setCode("");
    setProblem(null);
    setFieldError({ code: "", phone: "" });
    requestAnimationFrame(() => document.getElementById(phoneId)?.focus());
  }

  if (!sent) {
    return (
      <form className="grid gap-5" noValidate onSubmit={sendCode}>
        <Field
          description={
            smsCodes
              ? "The number you gave on your first visit. We will text a 6-digit code to it."
              : "The number you gave on your first visit."
          }
          error={fieldError.phone}
          id={phoneId}
          label="Mobile number"
          required
        >
          <IconInput icon={Phone}>
            <input
              aria-describedby={`${phoneId}-description${fieldError.phone ? ` ${phoneId}-error` : ""}`}
              aria-invalid={Boolean(fieldError.phone)}
              autoComplete="tel"
              className="pl-11"
              disabled={busy === "send"}
              id={phoneId}
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              placeholder="024 000 0000"
              type="tel"
              value={phone}
            />
          </IconInput>
        </Field>

        {problem ? <Problem title={problem.title}>{problem.message}</Problem> : null}

        {modeError ? (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-900"
            role="alert"
          >
            <p className="font-bold">Check-in unavailable</p>
            <p className="mt-1">
              The returning check-in could not be loaded. Check your
              connection and try again.
            </p>
            <button
              className="mt-2 font-bold underline decoration-2 underline-offset-2"
              onClick={() => {
                setModeError(false);
                setModeAttempt((attempt) => attempt + 1);
              }}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null}

        <StepButton
          disabled={busy === "send" || smsCodes === null}
          ready={phoneReady && smsCodes !== null}
          type="submit"
        >
          {busy === "send" || (smsCodes === null && !modeError) ? (
            <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
          ) : smsCodes ? (
            <MessageSquareText aria-hidden="true" className="size-5" />
          ) : null}
          {smsCodes
            ? busy === "send"
              ? "Sending code…"
              : "Send code"
            : busy === "send"
              ? "Finding your record…"
              : "Find my record"}
          {smsCodes || busy === "send" ? null : (
            <ArrowRight aria-hidden="true" className="size-5" />
          )}
        </StepButton>

        <HelpLinks smsCodes={smsCodes} />
      </form>
    );
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={verifyCode}>
      <p
        className="flex items-start gap-3 rounded-2xl border border-[#99e2d6] bg-[#f0fdfa] p-4 text-sm leading-6 text-slate-800 dark:border-[#14756d] dark:bg-[#0b2b29] dark:text-[#e2e8f0]!"
        role="status"
      >
        <MessageSquareText aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-[#0f766e] dark:text-[#5eead4]" />
        <span>
          If <span className="font-bold tabular-nums">{sent.maskedPhone}</span> is
          registered with us, we have sent a 6-digit code to it by SMS. The
          code expires in 5 minutes.
        </span>
      </p>

      <Field
        description="Your phone may offer to fill it in from the message."
        error={fieldError.code}
        id={codeId}
        label="Code from the SMS"
        required
      >
        <IconInput icon={KeyRound}>
          <input
            aria-describedby={`${codeId}-description${fieldError.code ? ` ${codeId}-error` : ""}`}
            aria-invalid={Boolean(fieldError.code)}
            autoComplete="one-time-code"
            className="pl-11 text-lg font-bold tracking-[0.4em] tabular-nums"
            disabled={busy === "verify"}
            id={codeId}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(digitsOnly(event.target.value))}
            pattern="[0-9]*"
            placeholder="000000"
            value={code}
          />
        </IconInput>
      </Field>

      {problem ? <Problem title={problem.title}>{problem.message}</Problem> : null}

      <StepButton disabled={busy !== ""} ready={code.length === 6} type="submit">
        {busy === "verify" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : null}
        {busy === "verify" ? "Checking code…" : "Verify and continue"}
        {busy === "verify" ? null : <ArrowRight aria-hidden="true" className="size-5" />}
      </StepButton>

      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:ring-4 focus-visible:ring-brand-200 disabled:cursor-not-allowed disabled:text-slate-600 dark:border-[#263247]! dark:bg-[#111a2b]! dark:text-[#e2e8f0]! dark:disabled:text-[#94a3b8]!"
          disabled={busy !== "" || resendIn > 0}
          onClick={() => void sendCode()}
          type="button"
        >
          {busy === "send" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RotateCcw aria-hidden="true" className="size-4" />
          )}
          {resendIn > 0 ? `Resend code in ${formatCountdown(resendIn)}` : "Resend code"}
        </button>
        <button
          className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-[#0f766e] transition-colors hover:bg-brand-50 focus-visible:ring-4 focus-visible:ring-brand-200 dark:text-[#5eead4]! dark:hover:bg-[#0b2b29]!"
          disabled={busy !== ""}
          onClick={changeNumber}
          type="button"
        >
          Change number
        </button>
      </div>

      <HelpLinks smsCodes />
    </form>
  );
}
