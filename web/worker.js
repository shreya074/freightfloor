import { audit, solve } from "../src/planner.js";
self.onmessage = ({ data }) => {
  try {
    const result = solve(data, { horizon: 64, maxNodes: 10000 });
    if (result.status === "optimal") audit(data, result);
    self.postMessage(result);
  } catch (error) {
    self.postMessage({ status: "error", message: error.message });
  }
};
