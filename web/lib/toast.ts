// Tiny global toast: any component calls toast("..."), <Toast /> listens.
export const toast = (message: string): void => {
  window.dispatchEvent(new CustomEvent<string>("respool-toast", { detail: message }));
};
