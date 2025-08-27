/**
 * @fileoverview Renderer Process Entry Point
 *
 * This script is the main entry point for the plugin's user interface. It runs
 * in a sandboxed browser environment (the Electron renderer process).
 *
 * Its primary responsibilities are:
 * 1. Establishing a secure, type-safe ERPC connection to the main process service.
 * 2. Managing the DOM: rendering UI elements and handling user interactions.
 * 3. Calling the main process API to fetch and mutate data.
 */

// `getService` is the primary function for connecting the renderer to its
// corresponding main process service. It handles the underlying IPC handshake.
import { getService } from "@eleplug/elep/renderer";

// Import the API and data types from our shared `common` directory. This is the
// key to achieving end-to-end type safety.
import type { MyPluginApi, FormData } from "../src/api";

// Import the stylesheet for the UI.
import "./style.css";

// --- 1. ESTABLISH ERPC CONNECTION ---
console.log("[Renderer] Script loaded. Connecting to main process service...");

// `getService` returns a strongly-typed ERPC client. The generic `<MyPluginApi>`
// argument tells TypeScript the exact shape of the API we're connecting to.
// This enables autocompletion and compile-time checks for all API calls.
const service = await getService<MyPluginApi>();
console.log("[Renderer] ERPC client connected successfully.");

// --- 2. CACHE DOM ELEMENT REFERENCES ---
// It's a best practice to query for DOM elements once and store the references.
const form = document.getElementById("contact-form") as HTMLFormElement;
const nameInput = document.getElementById("name") as HTMLInputElement;
const emailInput = document.getElementById("email") as HTMLInputElement;
const messageInput = document.getElementById("message") as HTMLTextAreaElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const responseDiv = document.getElementById(
  "response-message"
) as HTMLDivElement;
const formListDiv = document.getElementById("form-list") as HTMLDivElement;

// --- 3. UI RENDERING LOGIC ---

/**
 * Renders the list of submitted forms based on the provided data array.
 * This function acts as the "view" layer, taking state and updating the DOM.
 * @param forms - The array of FormData objects to render.
 */
const renderFormList = (forms: FormData[]) => {
  formListDiv.innerHTML = ""; // Clear the existing list to prevent duplicates.

  if (forms.length === 0) {
    formListDiv.innerHTML =
      '<p class="empty-state">No submissions yet. Fill out the form to get started!</p>';
    return;
  }

  // Create and append an element for each form submission.
  forms.forEach((form) => {
    const item = document.createElement("div");
    item.className = "form-item";
    item.innerHTML = `
      <button class="delete-btn" data-id="${form.id}" title="Delete Submission">&times;</button>
      <p><strong>Name:</strong> ${form.name}</p>
      <p><strong>Email:</strong> ${form.email}</p>
      <p><strong>Message:</strong></p>
      <div class="message-content">${form.message}</div>
    `;
    formListDiv.appendChild(item);
  });
};

/**
 * A helper utility to display a temporary status message (success or error).
 * @param message - The text to display.
 * @param type - The type of message, which controls the styling.
 */
const showResponseMessage = (message: string, type: "success" | "error") => {
  responseDiv.textContent = message;
  responseDiv.className = `response ${type}`;
  // The message will automatically disappear after 3 seconds.
  setTimeout(() => (responseDiv.className = "response"), 3000);
};

// --- 4. EVENT LISTENERS ---

/**
 * Handles the form submission event.
 */
form.addEventListener("submit", async (event) => {
  event.preventDefault(); // Prevent the default browser form submission behavior.

  // Provide user feedback during the async operation.
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";

  try {
    const formData = {
      name: nameInput.value,
      email: emailInput.value,
      message: messageInput.value,
    };

    // Call the main process API. This looks like a local function call but is
    // actually a type-safe RPC call over IPC. The API returns the new, complete
    // list of submissions.
    const updatedForms = await service.form.submitForm.ask(formData);

    // Update the UI with the fresh data from the backend. This is a simple and
    // robust way to keep the UI in sync with the application's state.
    renderFormList(updatedForms);
    showResponseMessage(
      `Thank you, ${formData.name}! Your message has been received.`,
      "success"
    );
    form.reset();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    showResponseMessage(`Error: ${errorMessage}`, "error");
  } finally {
    // Always re-enable the button, whether the call succeeded or failed.
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit";
  }
});

/**
 * Handles clicks on the list container, using event delegation for the delete buttons.
 * This is more efficient than adding a listener to every single delete button.
 */
formListDiv.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  // Check if the clicked element is a delete button.
  if (target.classList.contains("delete-btn")) {
    const formId = target.getAttribute("data-id");
    if (!formId) return;

    try {
      // Call the delete API with the form's ID.
      const updatedForms = await service.form.deleteForm.ask(formId);
      // Re-render the list with the updated data.
      renderFormList(updatedForms);
      showResponseMessage("Submission deleted.", "success");
    } catch (error) {
      console.error("Delete failed:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      showResponseMessage(`Error deleting: ${errorMessage}`, "error");
    }
  }
});

// --- 5. INITIALIZATION ---

/**
 * The main initialization function for the renderer application.
 * It fetches the initial state from the main process when the page loads.
 */
const initializeApp = async () => {
  try {
    const initialForms = await service.form.getForms.ask();
    renderFormList(initialForms);
  } catch (error) {
    console.error("Failed to fetch initial forms:", error);
    formListDiv.innerHTML =
      '<p class="empty-state error">Could not load submissions.</p>';
  }
};

// Start the application.
initializeApp();
