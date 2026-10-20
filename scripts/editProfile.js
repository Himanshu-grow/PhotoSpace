import { getProfile, saveProfile, defaultProfile, readImageAsDataURL } from "./profile.js";

const fields = ["username", "name", "email", "website", "bio", "location", "profession"];
const saveButton = document.querySelector(".save-btn");
const profileImage = document.querySelector(".profile-image");
const imageInput = document.querySelector("#edit-profile-image-input");
const changePictureButton = document.querySelector(".change-picture-btn");
const removePictureButton = document.querySelector(".remove-picture-btn");
const bioInput = document.querySelector("#bio");
const characterCount = document.querySelector(".character-count");
const privateAccountInput = document.querySelector("#private-account");
let profile = { ...defaultProfile };

function updateCharacterCount() { characterCount.textContent = `${bioInput.value.length} / ${bioInput.maxLength}`; }
async function populateForm() {
    try { profile = await getProfile(); }
    catch (error) { console.error("Could not load profile:", error); window.alert("Your saved profile could not be loaded. Please refresh and try again."); }
    fields.forEach(field => { document.querySelector(`#${field}`).value = profile[field] ?? ""; });
    profileImage.src = profile.profileImage || defaultProfile.profileImage;
    privateAccountInput.checked = Boolean(profile.privateAccount);
    updateCharacterCount();
}
populateForm();
bioInput.addEventListener("input", updateCharacterCount);
changePictureButton.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { imageInput.value = ""; window.alert("Please choose a valid image file."); return; }
    if (file.size > 2 * 1024 * 1024) { imageInput.value = ""; window.alert("Please choose an image smaller than 2 MB."); return; }
    try { profile.profileImage = await readImageAsDataURL(file); profileImage.src = profile.profileImage; }
    catch (error) { console.error("Could not read profile image:", error); window.alert("The image could not be loaded. Please try another one."); }
});
removePictureButton.addEventListener("click", () => { profile.profileImage = defaultProfile.profileImage; profileImage.src = defaultProfile.profileImage; imageInput.value = ""; });
saveButton.addEventListener("click", async () => {
    const values = Object.fromEntries(fields.map(field => [field, document.querySelector(`#${field}`).value.trim()]));
    if (!values.username || !values.name) { window.alert("Please enter both a username and a name."); return; }
    if (values.bio.length > 150) { window.alert("Your bio must be 150 characters or fewer."); return; }
    profile = { ...profile, ...values, privateAccount: privateAccountInput.checked };
    saveButton.disabled = true;
    try { await saveProfile(profile); window.location.href = "main.html"; }
    catch (error) { console.error("Could not save profile:", error); window.alert("Your profile could not be saved. Please check available browser storage and try again."); }
    finally { saveButton.disabled = false; }
});
document.querySelector(".delete-btn").addEventListener("click", () => { window.alert("PhotoSpace is currently a browser-based demo and has no account system. This button cannot delete an account."); });
