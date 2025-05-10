const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
}

let goldTiles = [];
let foodTiles = [];

let gameHasStartedOnce = false; // Flag to track if the game has started at least once
let currentModalColonyIndex = -1; // Track which colony's upgrade modal is open
let currentPriorityModalColonyIndex = -1; // Track which colony's priority modal is open

function spawnGoldAndFood() {
    const goldX = getRandomInt(canvas.width);
    const goldY = getRandomInt(canvas.height);
    goldTiles.push({ x: goldX, y: goldY });
    drawPixel(goldX, goldY, 'yellow');

    const foodX = getRandomInt(canvas.width);
    const foodY = getRandomInt(canvas.height);
    foodTiles.push({ x: foodX, y: foodY });
    drawPixel(foodX, foodY, 'white');
}

function updateColonyStats() {
    colonies.forEach((colony, index) => {
        const colonyInfoPanel = document.querySelector(`#colony-${index}-info`);
        if (!colonyInfoPanel) return;

        let statsDiv = colonyInfoPanel.querySelector('.colony-stats');
        if (!statsDiv) {
            statsDiv = document.createElement('div');
            statsDiv.className = 'colony-stats';
            colonyInfoPanel.insertBefore(statsDiv, colonyInfoPanel.querySelector('.colony-upgrades'));
        }

        // Update or create text elements for stats
        let titleEl = statsDiv.querySelector('.colony-title');
        if (!titleEl) {
            titleEl = document.createElement('h3');
            titleEl.className = 'colony-title';
            statsDiv.appendChild(titleEl);
        }
        titleEl.style.color = `var(--${colony.color.toLowerCase()}-colony-color)`;
        titleEl.textContent = `${colony.color.toUpperCase()} Colony ${colony.isAI ? '(AI)' : '(Player)'}`;

        updateOrCreateStatParagraph(statsDiv, 'pixels', `Pixels: ${colony.pixels.length}`);
        updateOrCreateStatParagraph(statsDiv, 'gold', `Gold: ${colony.gold}`);
        updateOrCreateStatParagraph(statsDiv, 'food-boost', `Food Boost: Lvl ${colony.upgradeLevel + colony.pendingUpgrades.food}`);
        updateOrCreateStatParagraph(statsDiv, 'pixel-boost', `Pixel Boost: Lvl ${colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel}`);
        updateOrCreateStatParagraph(statsDiv, 'focus-boost', `Focus Boost: Lvl ${colony.focusUpgradeLevel + colony.pendingUpgrades.focus}`);
        updateOrCreateStatParagraph(statsDiv, 'strength-boost', `Strength: Lvl ${colony.strengthUpgradeLevel + colony.pendingUpgrades.strength}`);
        updateOrCreateStatParagraph(statsDiv, 'current-priority', `Priority: ${colony.priority.toUpperCase()}`);

        // Priority Buttons - replaced with a single "Pixel Focus" button
        let priorityButtonsDiv = statsDiv.querySelector('.priority-buttons');
        if (!colony.isAI) {
            if (!priorityButtonsDiv) {
                priorityButtonsDiv = document.createElement('div');
                priorityButtonsDiv.className = 'priority-buttons'; // Keep class for potential styling
                statsDiv.appendChild(priorityButtonsDiv);
            }

            // Create "Pixel Focus" button if it doesn't exist
            let pixelFocusButton = priorityButtonsDiv.querySelector('.pixel-focus-button');
            if (!pixelFocusButton) {
                pixelFocusButton = document.createElement('button');
                pixelFocusButton.className = 'pixel-focus-button';
                pixelFocusButton.textContent = 'Pixel Focus';
                pixelFocusButton.title = 'Set colony pixel focus priority';
                pixelFocusButton.onclick = () => openPriorityModal(index);
                priorityButtonsDiv.appendChild(pixelFocusButton);
            }

            // Persistent "Open Upgrades" button for human players
            let openUpgradesBtn = statsDiv.querySelector('.open-upgrades-button');
            if (!openUpgradesBtn) {
                openUpgradesBtn = document.createElement('button');
                openUpgradesBtn.className = 'open-upgrades-button';
                openUpgradesBtn.textContent = 'View Upgrades';
                openUpgradesBtn.onclick = () => openUpgradeModal(index);
                // Insert it after priority buttons or at a suitable place
                if (priorityButtonsDiv) priorityButtonsDiv.insertAdjacentElement('afterend', openUpgradesBtn);
                else statsDiv.appendChild(openUpgradesBtn);
            }
        } else if (priorityButtonsDiv) {
            priorityButtonsDiv.innerHTML = ''; // Clear buttons for AI
            let openUpgradesBtn = statsDiv.querySelector('.open-upgrades-button');
            if(openUpgradesBtn) openUpgradesBtn.remove(); // Remove upgrade button for AI
        }
    });
}

function updateOrCreateStatParagraph(parent, idSuffix, text) {
    let pElement = parent.querySelector(`.stat-${idSuffix}`);
    if (!pElement) {
        pElement = document.createElement('p');
        pElement.className = `stat-${idSuffix}`;
        parent.appendChild(pElement);
    }
    pElement.textContent = text;
}

let redUpgradeLevel = 0;
let gameInterval;
let spawnInterval;
let upgradeInterval;
let roundTimerInterval; // For the visual countdown timer
let roundTimeRemaining = 60; // Time in seconds for a round

function startGame() {
    // Clear any existing intervals for robustness
    clearInterval(gameInterval);
    clearInterval(spawnInterval);
    clearInterval(upgradeInterval);
    clearInterval(roundTimerInterval); // Clear previous round timer

    // Ensure upgrade UI and reset button are hidden at the start of a round
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');
    document.getElementById('resetGameButtonContainer').style.display = 'none';

    roundTimeRemaining = 60; // Reset time for the new round
    updateTimerDisplay(); // Initial display

    gameInterval = setInterval(updateColonies, 100);
    spawnInterval = setInterval(spawnGoldAndFood, 200);
    // Set timeout for the upgrade screen
    upgradeInterval = setTimeout(showUpgrades, 60000); // 1 minute
    roundTimerInterval = setInterval(tickRoundTimer, 1000); // Start visual countdown
}

function tickRoundTimer() {
    roundTimeRemaining--;
    updateTimerDisplay();
    if (roundTimeRemaining <= 0) {
        clearInterval(roundTimerInterval); // Stop timer when it reaches 0
        // showUpgrades is already set by setTimeout, so no need to call it here explicitly
    }
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('gameTimerDisplay');
    if (timerDisplay) {
        const minutes = Math.floor(roundTimeRemaining / 60);
        const seconds = roundTimeRemaining % 60;
        timerDisplay.textContent = `Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

function calculateUpgradeCost(currentLevel) {
    const baseCost = 5;
    const multiplier = 1.6;
    return Math.ceil(baseCost * Math.pow(multiplier, currentLevel));
}

function buyUpgrade(colonyIndex, type, calledFromModal = false) {
    const colony = colonies[colonyIndex];
    if (colony.isAI) return; // AI uses its own logic

    let effectiveCurrentLevel;
    if (type === 'food') effectiveCurrentLevel = colony.upgradeLevel + colony.pendingUpgrades.food;
    else if (type === 'pixel') effectiveCurrentLevel = colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel;
    else if (type === 'focus') effectiveCurrentLevel = colony.focusUpgradeLevel + colony.pendingUpgrades.focus;
    else if (type === 'strength') effectiveCurrentLevel = colony.strengthUpgradeLevel + colony.pendingUpgrades.strength;
    else return;

    const upgradeCost = calculateUpgradeCost(effectiveCurrentLevel);
    const maxLevel = 8;

    if (colony.gold >= upgradeCost && effectiveCurrentLevel < maxLevel) {
        colony.gold -= upgradeCost;
        if (type === 'food') colony.pendingUpgrades.food++;
        else if (type === 'pixel') colony.pendingUpgrades.pixel++;
        else if (type === 'focus') colony.pendingUpgrades.focus++;
        else if (type === 'strength') colony.pendingUpgrades.strength++;
        updateColonyStats();
        if (calledFromModal && currentModalColonyIndex === colonyIndex) {
            populateUpgradeModalContent(colonyIndex);
        }
    } else if (effectiveCurrentLevel >= maxLevel) {
        alert(`Maximum ${type} upgrade level (including pending) reached for ${colony.color} colony!`);
    } else {
        alert(`Not enough gold for ${colony.color} colony to buy next ${type} upgrade! Cost: ${upgradeCost}, Your Gold: ${colony.gold}`);
    }
}

function resetGame() {
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');
    document.getElementById('resetGameButtonContainer').style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    goldTiles = [];
    foodTiles = [];

    colonies.forEach((colony, index) => {
        // Apply pending upgrades (these affect levels for pixel spawning)
        colony.upgradeLevel += colony.pendingUpgrades.food;
        colony.pixelUpgradeLevel += colony.pendingUpgrades.pixel;
        colony.focusUpgradeLevel += colony.pendingUpgrades.focus;
        colony.strengthUpgradeLevel += colony.pendingUpgrades.strength;
        colony.pendingUpgrades = { food: 0, pixel: 0, focus: 0, strength: 0 };

        colony.upgradeLevel = Math.min(colony.upgradeLevel, 8);
        colony.pixelUpgradeLevel = Math.min(colony.pixelUpgradeLevel, 8);
        colony.focusUpgradeLevel = Math.min(colony.focusUpgradeLevel, 8);
        colony.strengthUpgradeLevel = Math.min(colony.strengthUpgradeLevel, 8);
        
        const startingPixels = 10 + colony.pixelUpgradeLevel * 5;
        const corner = getCornerCoordinates(index, canvas);
        colony.pixels = Array.from({ length: startingPixels }, () => ({ x: corner.x, y: corner.y, randomMoveCount: 0 }));

        // Gold logic:
        // if (gameHasStartedOnce) { // Removed: No +1 gold for subsequent rounds
        //     // For subsequent rounds (triggered by "Initialize Next Round" button), add 1 gold.
        //     colony.gold += 1;
        // }
        // If !gameHasStartedOnce, gold remains its current value (which is 0 from initial definition
        // when called from initializeGameSetup for the first time).
        // Gold is now purely based on collection and carry-over.
    });

    if (!gameHasStartedOnce) {
        gameHasStartedOnce = true; // Mark that the first round setup is complete.
    }

    runAIPrioritySetting();
    updateColonyStats();
    startGame();
}

function getCornerCoordinates(index, canvas) {
    switch (index) {
        case 0: return { x: 0, y: 0 }; // Top-left
        case 1: return { x: canvas.width - 1, y: 0 }; // Top-right
        case 2: return { x: 0, y: canvas.height - 1 }; // Bottom-left
        case 3: return { x: canvas.width - 1, y: canvas.height - 1 }; // Bottom-right
        default: return { x: 0, y: 0 };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Event listener for the button on the startup screen
    document.getElementById('initializeGameButton').addEventListener('click', initializeGameSetup);

    // Event listener for the "Initialize Next Round" button
    document.getElementById('resetGame').addEventListener('click', resetGame);

    // Event listener for closing the upgrade modal
    document.getElementById('closeUpgradeModal').addEventListener('click', closeUpgradeModal);

    // About Modal Listeners
    const openAboutModalButton = document.getElementById('openAboutModalButton');
    const aboutModal = document.getElementById('aboutModal');
    const closeAboutModalButton = document.getElementById('closeAboutModal');
    const aboutModalContent = document.getElementById('aboutModalContent');
    const gameInfoSection = document.getElementById('gameInfoSection');

    if (openAboutModalButton) {
        openAboutModalButton.addEventListener('click', () => {
            if (gameInfoSection && aboutModalContent) {
                aboutModalContent.innerHTML = gameInfoSection.innerHTML;
            }
            if (aboutModal) aboutModal.style.display = 'flex';
        });
    }

    if (closeAboutModalButton) {
        closeAboutModalButton.addEventListener('click', () => {
            if (aboutModal) aboutModal.style.display = 'none';
        });
    }

    if (aboutModal) {
        aboutModal.addEventListener('click', (event) => {
            if (event.target === aboutModal) { // Click was directly on the overlay
                aboutModal.style.display = 'none';
            }
        });
    }

    // Close upgrade modal if clicking outside the modal content (on the overlay)
    const upgradeModalOverlay = document.getElementById('upgradeModal');
    if (upgradeModalOverlay) { // Ensure the element exists
        upgradeModalOverlay.addEventListener('click', (event) => {
            if (event.target === upgradeModalOverlay) { // Check if the click was directly on the overlay
                closeUpgradeModal();
            }
        });
    }

    // Set initial UI state: show startup screen, hide game content and reset button
    const startupScreen = document.getElementById('startupScreen');
    const gameContent = document.getElementById('gameContent');
    const resetGameButtonContainer = document.getElementById('resetGameButtonContainer');

    if (startupScreen) startupScreen.style.display = 'flex'; // Or 'block' based on your CSS for it
    if (gameContent) gameContent.style.display = 'none';
    if (resetGameButtonContainer) resetGameButtonContainer.style.display = 'none';
    
    // Do NOT call resetGame() here. The game starts via initializeGameSetup.

    // Priority Modal Listeners
    const priorityModal = document.getElementById('priorityModal');
    const closePriorityModalButton = document.getElementById('closePriorityModal');

    if (closePriorityModalButton) {
        closePriorityModalButton.addEventListener('click', closePriorityModal);
    }
    if (priorityModal) {
        priorityModal.addEventListener('click', (event) => {
            if (event.target === priorityModal) { // Click was directly on the overlay
                closePriorityModal();
            }
        });
    }
});

function movePixel(pixel, colony, colonyIndex) {
    let moved = false;
    const requiredRandomMoves = Math.max(1, 10 - colony.focusUpgradeLevel);

    if (colony.priority !== 'none' && pixel.randomMoveCount >= requiredRandomMoves) {
        pixel.randomMoveCount = 0;
        let nearestTarget = null;
        if (colony.priority === 'food') {
            nearestTarget = findNearest(pixel, foodTiles);
        } else if (colony.priority === 'gold') {
            nearestTarget = findNearest(pixel, goldTiles);
        } else if (colony.priority === 'pixel') {
            nearestTarget = findNearestEnemyPixel(pixel, colonyIndex);
        }
        
        if (nearestTarget) {
            const targetDx = Math.sign(nearestTarget.x - pixel.x);
            const targetDy = Math.sign(nearestTarget.y - pixel.y);
            if (targetDx !== 0 || targetDy !== 0) {
                pixel.x = Math.max(0, Math.min(canvas.width - 1, pixel.x + targetDx));
                pixel.y = Math.max(0, Math.min(canvas.height - 1, pixel.y + targetDy));
                moved = true;
            }
        }
    }

    if (!moved) {
        const directions = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 }];
        const direction = directions[getRandomInt(directions.length)];
        pixel.x = Math.max(0, Math.min(canvas.width - 1, pixel.x + direction.dx));
        pixel.y = Math.max(0, Math.min(canvas.height - 1, pixel.y + direction.dy));
        if (colony.priority !== 'none' && colony.priority !== 'pixel') {
            pixel.randomMoveCount++;
        } else if (colony.priority === 'pixel') {
            pixel.randomMoveCount++;
        }
    }

    // --- Combat Resolution --- 
    let attackerSurvived = true;
    for (let otherColonyIndex = 0; otherColonyIndex < colonies.length; otherColonyIndex++) {
        if (otherColonyIndex === colonyIndex) continue; // Don't fight own colony

        const otherColony = colonies[otherColonyIndex];
        const defenderIndex = otherColony.pixels.findIndex(p => p.x === pixel.x && p.y === pixel.y);

        if (defenderIndex !== -1) {
            const defenderPixel = otherColony.pixels[defenderIndex];
            const attackerStrength = 1 + colony.strengthUpgradeLevel;
            const defenderStrength = 1 + otherColony.strengthUpgradeLevel;

            console.log(`${colony.color} pixel (Str: ${attackerStrength}) attacks ${otherColony.color} pixel (Str: ${defenderStrength}) at (${pixel.x},${pixel.y})`);

            if (attackerStrength > defenderStrength) {
                otherColony.pixels.splice(defenderIndex, 1);
                console.log(`${otherColony.color} pixel destroyed.`);
            } else if (defenderStrength > attackerStrength) {
                attackerSurvived = false; // Attacker is destroyed
                console.log(`${colony.color} pixel destroyed.`);
            } else { // Strengths are equal
                if (Math.random() < 0.5) {
                    otherColony.pixels.splice(defenderIndex, 1);
                    console.log(`Tie! ${otherColony.color} pixel destroyed.`);
                } else {
                    attackerSurvived = false;
                    console.log(`Tie! ${colony.color} pixel destroyed.`);
                }
            }
            break; // Fight one pixel per interaction square
        }
    }
    // If attacker did not survive, remove it from its own colony
    if (!attackerSurvived) {
        const attackerPixelIndex = colony.pixels.indexOf(pixel);
        if (attackerPixelIndex !== -1) {
            colony.pixels.splice(attackerPixelIndex, 1);
        }
        return; // Attacker died, no further actions for this pixel this turn
    }
    // --- End Combat Resolution ---

    const foodIndex = foodTiles.findIndex(food => food.x === pixel.x && food.y === pixel.y);
    if (foodIndex !== -1) {
        foodTiles.splice(foodIndex, 1);
        const newPixelCount = 1 + colony.upgradeLevel;
        for (let i = 0; i < newPixelCount; i++) {
            colony.pixels.push({ x: pixel.x, y: pixel.y, randomMoveCount: 0 });
        }
    }

    const goldIndex = goldTiles.findIndex(gold => gold.x === pixel.x && gold.y === pixel.y);
    if (goldIndex !== -1) {
        goldTiles.splice(goldIndex, 1);
        colony.gold += 1;
    }
}

function updateColonies() {
    colonies.forEach((colony, index) => {
        // Iterate backwards when modifying the array during iteration (pixels being removed)
        for (let i = colony.pixels.length - 1; i >= 0; i--) {
            const pixel = colony.pixels[i];
            drawPixel(pixel.x, pixel.y, 'black'); // Clear old position
            movePixel(pixel, colony, index);      // Move and potentially fight
            // If pixel survived, draw it. If it died in movePixel, it won't be in the array or will be caught by loop condition.
            // However, movePixel itself handles removal, so we must check if it still exists.
            if (colony.pixels.includes(pixel)) { 
                drawPixel(pixel.x, pixel.y, colony.color); // Draw new position
            }
        }
    });
    updateColonyStats();
}

const colonies = [
    { color: 'red', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0 } },
    { color: 'green', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0 } },
    { color: 'purple', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0 } },
    { color: 'blue', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true, pendingUpgrades: { food: 0, pixel: 0, focus: 0, strength: 0 } }
];

function showUpgrades() {
    clearInterval(gameInterval);
    clearInterval(spawnInterval);
    clearInterval(roundTimerInterval); // Stop the visual timer
    
    console.log("Upgrade Phase Started. Game Paused.");
    runAIUpgrades(); // AI makes its choices first
    
    // No longer show .colony-upgrades divs in corners. Players use the modal.
    // document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'block');
    // updateUpgradeButtons(); // This function is now for the modal, not corner panels.

    document.getElementById('resetGameButtonContainer').style.display = 'block';
}

// Helper function to find the nearest item
function findNearest(currentPixel, itemsArray) {
    if (!itemsArray || itemsArray.length === 0) return null;
    let nearest = null;
    let minDistance = Infinity;

    itemsArray.forEach(item => {
        const distance = Math.abs(currentPixel.x - item.x) + Math.abs(currentPixel.y - item.y);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = item;
        }
    });
    return nearest;
}

function setColonyPriority(colonyIndex, priorityType) {
    if (colonies[colonyIndex]) {
        if (colonies[colonyIndex].priority === priorityType && !colonies[colonyIndex].isAI) return; // No change if already set for human
        colonies[colonyIndex].priority = priorityType;
        colonies[colonyIndex].pixels.forEach(p => p.randomMoveCount = 0); // Reset random move count for new priority targeting
        updateColonyStats();

        // If the priority modal is open for this colony, refresh its content
        if (document.getElementById('priorityModal').style.display === 'flex' && currentPriorityModalColonyIndex === colonyIndex) {
            populatePriorityModalContent(colonyIndex);
        }
    }
}

// Helper to find nearest enemy pixel
function findNearestEnemyPixel(currentPixel, currentPixelColonyIndex) {
    let nearestEnemy = null;
    let minDistance = Infinity;

    colonies.forEach((otherColony, otherColonyIndex) => {
        if (otherColonyIndex === currentPixelColonyIndex) return; // Skip self

        otherColony.pixels.forEach(enemyPixel => {
            const distance = Math.abs(currentPixel.x - enemyPixel.x) + Math.abs(currentPixel.y - enemyPixel.y);
            if (distance < minDistance) {
                minDistance = distance;
                nearestEnemy = enemyPixel;
            }
        });
    });
    return nearestEnemy;
}

function runAIUpgrades() {
    console.log("Running AI Upgrades...");
    colonies.forEach((colony, index) => {
        if (colony.isAI) {
            let canAffordAnUpgrade = true;
            while (canAffordAnUpgrade && colony.gold > 0) {
                const possibleUpgrades = [
                    { type: 'food', level: colony.upgradeLevel + colony.pendingUpgrades.food, cost: calculateUpgradeCost(colony.upgradeLevel + colony.pendingUpgrades.food) },
                    { type: 'pixel', level: colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel, cost: calculateUpgradeCost(colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel) },
                    { type: 'focus', level: colony.focusUpgradeLevel + colony.pendingUpgrades.focus, cost: calculateUpgradeCost(colony.focusUpgradeLevel + colony.pendingUpgrades.focus) },
                    { type: 'strength', level: colony.strengthUpgradeLevel + colony.pendingUpgrades.strength, cost: calculateUpgradeCost(colony.strengthUpgradeLevel + colony.pendingUpgrades.strength) }
                ];
                const affordableUpgrades = possibleUpgrades.filter(upg => upg.level < 8 && colony.gold >= upg.cost);
                if (affordableUpgrades.length === 0) {
                    canAffordAnUpgrade = false; break;
                }
                affordableUpgrades.sort((a, b) => a.cost - b.cost);
                const bestUpgradeToBuy = affordableUpgrades[0];
                colony.gold -= bestUpgradeToBuy.cost;
                if (bestUpgradeToBuy.type === 'food') colony.pendingUpgrades.food++;
                else if (bestUpgradeToBuy.type === 'pixel') colony.pendingUpgrades.pixel++;
                else if (bestUpgradeToBuy.type === 'focus') colony.pendingUpgrades.focus++;
                else if (bestUpgradeToBuy.type === 'strength') colony.pendingUpgrades.strength++;
                console.log(`AI Colony ${colony.color} queued ${bestUpgradeToBuy.type} upgrade. Gold remaining: ${colony.gold}`);
            }
        }
    });
}

function runAIPrioritySetting() {
    console.log("Running AI Priority Setting...");
    colonies.forEach((colony, index) => {
        if (colony.isAI) {
            const priorities = ['food', 'gold', 'pixel'];
            const chosenPriority = priorities[getRandomInt(priorities.length)];
            setColonyPriority(index, chosenPriority);
            console.log(`AI Colony ${colony.color} set priority to ${chosenPriority}`);
        }
    });
}

function initializeGameSetup() {
    const numPlayersInput = document.getElementById('numPlayersInput');
    const numHumanPlayers = parseInt(numPlayersInput.value);

    if (isNaN(numHumanPlayers) || numHumanPlayers < 1 || numHumanPlayers > 4) {
        alert("Please enter a valid number of players (1-4).");
        return;
    }

    // Set AI flags
    for (let i = 0; i < 4; i++) {
        colonies[i].isAI = (i >= numHumanPlayers);
    }

    console.log("Colony AI setup:", colonies.map(c => ({color: c.color, isAI: c.isAI })));

    document.getElementById('startupScreen').style.display = 'none';
    document.getElementById('gameContent').style.display = 'flex'; // Or block, depending on your main layout

    gameHasStartedOnce = false; // Crucial: Set for the very first game start sequence
    resetGame(); // Initialize and start the first round
}

// This function now populates the MODAL instead of corner panels
function populateUpgradeModalContent(colonyIndex) {
    const colony = colonies[colonyIndex];
    if (!colony || colony.isAI) {
        closeUpgradeModal(); // Should not happen for AI via UI
        return;
    }

    document.getElementById('modalColonyName').textContent = `${colony.color.toUpperCase()} Colony Upgrades`;
    document.getElementById('modalColonyGold').textContent = colony.gold;
    
    const modalUpgradeButtonsContainer = document.getElementById('modalUpgradeButtonsContainer');
    modalUpgradeButtonsContainer.innerHTML = ''; // Clear old buttons

    const upgradeTypes = [
        { type: 'food', name: 'Food Boost', currentEffectiveLevel: colony.upgradeLevel + colony.pendingUpgrades.food, effect: '' },
        { type: 'pixel', name: 'Pixel Boost', currentEffectiveLevel: colony.pixelUpgradeLevel + colony.pendingUpgrades.pixel, effect: '' },
        { type: 'focus', name: 'Focus Boost', currentEffectiveLevel: colony.focusUpgradeLevel + colony.pendingUpgrades.focus, effect: `Reduces random moves by ${colony.focusUpgradeLevel + colony.pendingUpgrades.focus}` },
        { type: 'strength', name: 'Strength Boost', currentEffectiveLevel: colony.strengthUpgradeLevel + colony.pendingUpgrades.strength, effect: `Increases pixel strength by ${colony.strengthUpgradeLevel + colony.pendingUpgrades.strength}` }
    ];

    upgradeTypes.forEach(upg => {
        const cost = calculateUpgradeCost(upg.currentEffectiveLevel);
        const button = document.createElement('button');
        button.innerText = `${upg.name} ($${cost}) - Lvl ${upg.currentEffectiveLevel}`;
        button.title = `Cost: ${cost} Gold. Current Lvl (incl. pending): ${upg.currentEffectiveLevel}. ${upg.effect}`.trim();
        button.onclick = () => buyUpgrade(colonyIndex, upg.type, true);
        button.disabled = upg.currentEffectiveLevel >= 8 || colony.gold < cost;
        modalUpgradeButtonsContainer.appendChild(button);
    });
}

function openUpgradeModal(colonyIndex) {
    currentModalColonyIndex = colonyIndex; // Store which colony's modal is open
    populateUpgradeModalContent(colonyIndex);
    document.getElementById('upgradeModal').style.display = 'flex';
}

function closeUpgradeModal() {
    currentModalColonyIndex = -1;
    document.getElementById('upgradeModal').style.display = 'none';
}

// --- Priority Modal Functions ---
function openPriorityModal(colonyIndex) {
    currentPriorityModalColonyIndex = colonyIndex;
    const colony = colonies[colonyIndex];
    if (!colony || colony.isAI) return; // Should not be callable for AI from UI

    document.getElementById('priorityModalTitle').textContent = `Set Pixel Focus for ${colony.color.toUpperCase()} Colony`;
    populatePriorityModalContent(colonyIndex);
    document.getElementById('priorityModal').style.display = 'flex';
}

function populatePriorityModalContent(colonyIndex) {
    const colony = colonies[colonyIndex];
    const priorityModalButtonsContainer = document.getElementById('priorityModalButtonsContainer');
    priorityModalButtonsContainer.innerHTML = ''; // Clear old buttons

    const priorities = [
        { type: 'food', name: 'Food Priority', description: 'Pixels will target the nearest Food tile.' },
        { type: 'gold', name: 'Gold Priority', description: 'Pixels will target the nearest Gold tile.' },
        { type: 'pixel', name: 'Pixel Priority', description: 'Pixels will target the nearest enemy Pixel.' }
    ];

    priorities.forEach(pTypeInfo => {
        const button = document.createElement('button');
        button.textContent = pTypeInfo.name;
        button.title = pTypeInfo.description;
        button.dataset.priorityType = pTypeInfo.type;
        button.onclick = () => handlePrioritySelectionFromModal(pTypeInfo.type);
        if (colony.priority === pTypeInfo.type) {
            button.classList.add('active-priority'); // Reuse existing class or create a new one for modal
        }
        priorityModalButtonsContainer.appendChild(button);
    });
}

function handlePrioritySelectionFromModal(priorityType) {
    if (currentPriorityModalColonyIndex === -1) return;
    setColonyPriority(currentPriorityModalColonyIndex, priorityType);
    // No need to explicitly close, user can make multiple changes or close manually.
    // populatePriorityModalContent will be called by setColonyPriority if modal is still open.
}

function closePriorityModal() {
    currentPriorityModalColonyIndex = -1;
    document.getElementById('priorityModal').style.display = 'none';
}
