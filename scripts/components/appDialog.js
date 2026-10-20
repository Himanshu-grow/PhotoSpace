
const appDialog = document.querySelector("#app-dialog");
const dialogCard = appDialog.querySelector(".app-dialog-card");

const dialogTitle = document.querySelector("#dialog-title");
const dialogMessage = document.querySelector("#dialog-message");
const dialogIcon = document.querySelector("#dialog-icon");
const dialogInput = document.querySelector("#dialog-input");

const dialogCancel = document.querySelector("#dialog-cancel");
const dialogConfirm = document.querySelector("#dialog-confirm");

export function showAppDialog({
    title,
    message,
    mode = "alert",
    value = "",
    confirmText,
    danger = false
}) {
    return new Promise(resolve => {
        dialogTitle.textContent = title;
        dialogMessage.textContent = message;

        dialogInput.value = value;
        dialogInput.classList.toggle("hidden", mode !== "prompt");
        dialogCancel.classList.toggle("hidden", mode === "alert");

        dialogConfirm.textContent =
            confirmText ||
            (mode === "alert" ? "Got it" :
             mode === "prompt" ? "Save note" : "Confirm");

        dialogIcon.textContent =
            danger ? "!" : mode === "prompt" ? "✎" : "✦";

        dialogCard.classList.toggle("dialog-danger", danger);
        appDialog.classList.remove("hidden");

        if (mode === "prompt") {
            dialogInput.focus();
        } else {
            dialogConfirm.focus();
        }

        let finished = false;

        function finish(result) {
            if (finished) return;
            finished = true;

            appDialog.classList.add("hidden");

            dialogConfirm.removeEventListener("click", onConfirm);
            dialogCancel.removeEventListener("click", onCancel);
            appDialog.removeEventListener("click", onBackdrop);
            document.removeEventListener("keydown", onKeydown);

            resolve(result);
        }

        function onConfirm() {
            finish(mode === "prompt" ? dialogInput.value : true);
        }

        function onCancel() {
            finish(mode === "prompt" ? null : false);
        }

        function onBackdrop(event) {
            if (event.target === appDialog) {
                onCancel();
            }
        }

        function onKeydown(event) {
            if (event.key === "Escape") {
                onCancel();
            }

            if (
                event.key === "Enter" &&
                mode !== "prompt" &&
                !event.isComposing
            ) {
                event.preventDefault();
                onConfirm();
            }
        }

        dialogConfirm.addEventListener("click", onConfirm);
        dialogCancel.addEventListener("click", onCancel);
        appDialog.addEventListener("click", onBackdrop);
        document.addEventListener("keydown", onKeydown);
    });
}
