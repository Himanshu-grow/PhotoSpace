import { supabase } from "./supabaseClient.js";
import { getOpenReports, isCurrentModerator, moderateReport } from "./utilities/photoDB.js";
import "./authNav.js";

const list = document.querySelector("#moderation-list");
try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !await isCurrentModerator()) {
        list.textContent = "Moderator access is required to review reports.";
    } else {
        const reports = await getOpenReports();
        if (!reports.length) list.textContent = "No open reports.";
        for (const report of reports) {
            const card = document.createElement("article");
            card.className = "moderation-card";
            const heading = document.createElement("h2");
            const target = report.target?.name || report.target?.username || report.target?.text || "Unavailable or hidden item";
            heading.textContent = `${report.target_type}: ${target}`;
            const meta = document.createElement("p");
            meta.textContent = `${report.reason} · ${new Date(report.created_at).toLocaleString()} · Reported by ${report.reporter_id}`;
            const details = document.createElement("p");
            details.textContent = report.details || "No additional details supplied.";
            const actions = document.createElement("div");
            actions.className = "moderation-actions";
            const isHidden = Boolean(report.target?.is_hidden);
            const moderate = async action => {
                for (const button of actions.querySelectorAll("button")) button.disabled = true;
                try { await moderateReport(report.id, action); card.remove(); if (!list.children.length) list.textContent = "No open reports."; }
                catch (error) { details.textContent = error.message; for (const button of actions.querySelectorAll("button")) button.disabled = false; }
            };
            if (report.target_type !== "profile" && report.target?.username) {
                const view = document.createElement("a");
                view.href = report.target_type === "photo"
                    ? `profile.html?id=${encodeURIComponent(report.target.owner_id)}&photo=${encodeURIComponent(report.target_id)}`
                    : `profile.html?id=${encodeURIComponent(report.target.photoOwnerId)}&photo=${encodeURIComponent(report.target.photo_id)}`;
                view.textContent = `View @${report.target.username}`;
                actions.append(view);
            } else if (report.target_type === "profile") {
                const view = document.createElement("a");
                view.href = `profile.html?id=${encodeURIComponent(report.target_id)}`;
                view.textContent = `View @${report.target?.username || "profile"}`;
                actions.append(view);
            }
            const hide = document.createElement("button");
            hide.textContent = isHidden ? "Restore" : "Hide content";
            hide.addEventListener("click", () => moderate(isHidden ? "restore" : "hide"));
            const dismiss = document.createElement("button");
            dismiss.textContent = "Dismiss report";
            dismiss.addEventListener("click", () => moderate("dismiss"));
            actions.append(hide, dismiss);
            card.append(heading, meta, details, actions);
            list.append(card);
        }
    }
} catch (error) {
    console.error("Moderation page failed:", error);
    list.textContent = error.message || "Could not load reports.";
}
