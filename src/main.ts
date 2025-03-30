import './style.css';
import { Game } from './game';

// Ensure the DOM is fully loaded before starting the game
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded."); // Log DOM ready
  try {
    const canvasElement = document.getElementById('gameCanvas');
    if (!canvasElement) {
        console.error("FATAL: Canvas element #gameCanvas not found!");
        return; // Stop if canvas isn't there
    }
    console.log("Canvas element found:", canvasElement);

    const game = new Game('gameCanvas');
    console.log("Game instance created.");

    game.start();
    console.log("game.start() called.");
  } catch (error) {
    console.error("Error initializing or starting the game:", error);
    // Display error to the user potentially
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'absolute';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.padding = '10px';
    errorDiv.style.backgroundColor = 'red';
    errorDiv.style.color = 'white';
    errorDiv.style.zIndex = '1000';
    errorDiv.textContent = `Error starting game: ${error instanceof Error ? error.message : String(error)}`;
    document.body.appendChild(errorDiv);
  }
});
