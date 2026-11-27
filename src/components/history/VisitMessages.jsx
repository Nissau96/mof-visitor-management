import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { describeMessages } from "../../lib/visitMessages.js";
import { formatTime } from "../../lib/visitHistory.js";

/** SMS delivery lines for one visit. Read-only. */
export default function VisitMessages({ loadMessages, reference }) {
  const [state, setState] = useState({ error: "", key: "", lines: [] });
  const loading = state.key !== reference;

  useEffect(() => {
    if (!loadMessages || !reference) {
      return undefined;
    }

    let active = true;

    loadMessages(reference)
      .then((rows) => {
        if (active) {
          setState({ error: "", key: reference, lines: describeMessages(rows) });
        }
      })
      .catch(() => {
        if (active) {
          setState({ error: "Messages could not be loaded.", key: reference, lines: [] });
        }
      });

    return () => {
      active = false;
    };
  }, [loadMessages, reference]);

  if (!loadMessages || !reference) {
    return null;
  }

  return (
    <section aria-labelledby="visit-drawer-messages" aria-busy={loading} className="vh-softcard">
      <h3 className="vh-softtitle" id="visit-drawer-messages">
        Messages
      </h3>
      {loading ? (
        <p className="vh-cardnote">Loading messages…</p>
      ) : state.error ? (
        <p className="vh-cardnote">{state.error}</p>
      ) : state.lines.length === 0 ? (
        <p className="vh-cardnote">No text messages were sent for this visit.</p>
      ) : (
        <ul className="vh-msglist">
          {state.lines.map((line) => (
            <li className="vh-crow" key={line.id}>
              <span className="vh-cicon">
                <MessageCircle aria-hidden="true" size={16} />
              </span>
              <span className="vh-ctext">
                <span className="vh-clabel">{line.label}</span>
                <span className={`vh-cvalue vh-msg-${line.tone}`}>{line.text}</span>
              </span>
              {line.at ? <span className="vh-msgtime vh-tabular">{formatTime(line.at)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
