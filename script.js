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
        updateOrCreateStatParagraph(statsDiv, 'food-boost', `Food Boost: Lvl ${colony.upgradeLevel}`);
        updateOrCreateStatParagraph(statsDiv, 'pixel-boost', `Pixel Boost: Lvl ${colony.pixelUpgradeLevel}`);
        updateOrCreateStatParagraph(statsDiv, 'focus-boost', `Focus Boost: Lvl ${colony.focusUpgradeLevel}`);
        updateOrCreateStatParagraph(statsDiv, 'strength-boost', `Strength: Lvl ${colony.strengthUpgradeLevel}`);
        updateOrCreateStatParagraph(statsDiv, 'current-priority', `Priority: ${colony.priority.toUpperCase()}`);

        // Priority Buttons - create if they don't exist
        let priorityButtonsDiv = statsDiv.querySelector('.priority-buttons');
        if (!colony.isAI) {
            if (!priorityButtonsDiv) {
                priorityButtonsDiv = document.createElement('div');
                priorityButtonsDiv.className = 'priority-buttons';
                statsDiv.appendChild(priorityButtonsDiv);

                const priorities = ['food', 'gold', 'pixel'];
                priorities.forEach(pType => {
                    const button = document.createElement('button');
                    button.textContent = pType.charAt(0).toUpperCase() + pType.slice(1) + (pType === 'pixel' ? ' Priority' : '');
                    button.title = `Prioritize ${pType.charAt(0).toUpperCase() + pType.slice(1)}`;
                    button.dataset.priorityType = pType; // Store type for styling
                    button.onclick = () => setColonyPriority(index, pType);
                    priorityButtonsDiv.appendChild(button);
                });
            }
            // Update active class on priority buttons
            priorityButtonsDiv.querySelectorAll('button').forEach(btn => {
                btn.classList.toggle('active-priority', btn.dataset.priorityType === colony.priority);
            });
        } else if (priorityButtonsDiv) {
            priorityButtonsDiv.innerHTML = ''; // Clear buttons for AI
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

function startGame() {
    // Clear any existing intervals for robustness
    clearInterval(gameInterval);
    clearInterval(spawnInterval);
    clearInterval(upgradeInterval);

    // Ensure upgrade UI and reset button are hidden at the start of a round
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');
    document.getElementById('resetGameButtonContainer').style.display = 'none';

    gameInterval = setInterval(updateColonies, 100);
    spawnInterval = setInterval(spawnGoldAndFood, 200);
    // Set timeout for the upgrade screen
    upgradeInterval = setTimeout(showUpgrades, 60000); // 1 minute
}

function calculateUpgradeCost(currentLevel) {
    const baseCost = 5;
    const multiplier = 1.6;
    return Math.ceil(baseCost * Math.pow(multiplier, currentLevel));
}

function updateUpgradeButtons() {
    colonies.forEach((colony, index) => {
        const upgradeDiv = document.querySelector(`#colony-${index}-info .colony-upgrades`);
        if (upgradeDiv) {
            if (colony.isAI) {
                upgradeDiv.innerHTML = '<h4>AI Controlled</h4>';
                return; // Skip button creation for AI
            }
            upgradeDiv.innerHTML = '<h4>Available Upgrades:</h4>';
            const upgradeTypes = [
                { type: 'food', name: 'Food Boost', level: colony.upgradeLevel, effect: '' },
                { type: 'pixel', name: 'Pixel Boost', level: colony.pixelUpgradeLevel, effect: '' },
                { type: 'focus', name: 'Focus Boost', level: colony.focusUpgradeLevel, effect: `Reduces random moves by ${colony.focusUpgradeLevel}` },
                { type: 'strength', name: 'Strength Boost', level: colony.strengthUpgradeLevel, effect: `Increases pixel strength by ${colony.strengthUpgradeLevel}` }
            ];
            upgradeTypes.forEach(upg => {
                const cost = calculateUpgradeCost(upg.level);
                const button = document.createElement('button');
                button.innerText = `${upg.name} ($${cost})`;
                button.title = `Cost: ${cost} Gold. Current Lvl: ${upg.level}. ${upg.effect}`.trim();
                button.onclick = () => buyUpgrade(index, upg.type);
                button.disabled = upg.level >= 8 || colony.gold < cost;
                upgradeDiv.appendChild(button);
            });
        }
    });
}

function buyUpgrade(colonyIndex, type) {
    const colony = colonies[colonyIndex];
    if (colony.isAI) return; // AI uses its own logic

    let currentLevel;
    if (type === 'food') currentLevel = colony.upgradeLevel;
    else if (type === 'pixel') currentLevel = colony.pixelUpgradeLevel;
    else if (type === 'focus') currentLevel = colony.focusUpgradeLevel;
    else if (type === 'strength') currentLevel = colony.strengthUpgradeLevel;
    else return;

    const upgradeCost = calculateUpgradeCost(currentLevel);
    const maxLevel = 8;

    if (colony.gold >= upgradeCost && currentLevel < maxLevel) {
        colony.gold -= upgradeCost;
        if (type === 'food') colony.upgradeLevel++;
        else if (type === 'pixel') colony.pixelUpgradeLevel++;
        else if (type === 'focus') colony.focusUpgradeLevel++;
        else if (type === 'strength') colony.strengthUpgradeLevel++;
        updateColonyStats();
        updateUpgradeButtons();
    } else if (currentLevel >= maxLevel) {
        alert(`Maximum ${type} upgrade level reached for ${colony.color} colony!`);
    } else {
        alert(`Not enough gold for ${colony.color} colony to buy ${type} upgrade! Cost: ${upgradeCost}, Your Gold: ${colony.gold}`);
    }
}

function resetGame() {
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'none');
    document.getElementById('resetGameButtonContainer').style.display = 'none'; // Hide reset button container
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    goldTiles = [];
    foodTiles = [];
    colonies.forEach((colony, index) => {
        const startingPixels = 10 + colony.pixelUpgradeLevel * 5;
        const corner = getCornerCoordinates(index, canvas);
        colony.pixels = Array.from({ length: startingPixels }, () => ({ x: corner.x, y: corner.y, randomMoveCount: 0 }));
        // colony.priority = 'none'; // Optionally reset priority each game, or let it persist
    });
    runAIPrioritySetting(); // AI sets priorities for the new round
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
    // Ensure the reset button within its container gets the event listener
    document.getElementById('resetGame').addEventListener('click', resetGame);

    // Call resetGame() once on initial load to set up the board, 
    // populate initial pixels, update stats, and start the game.
    resetGame(); 
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
    { color: 'red', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true },
    { color: 'green', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true },
    { color: 'purple', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true },
    { color: 'blue', pixels: [], gold: 0, upgradeLevel: 0, pixelUpgradeLevel: 0, focusUpgradeLevel: 0, strengthUpgradeLevel: 0, priority: 'food', isAI: true }
];

function showUpgrades() {
    clearInterval(gameInterval);
    clearInterval(spawnInterval);
    runAIUpgrades(); // AI makes its choices first
    document.querySelectorAll('.colony-upgrades').forEach(div => div.style.display = 'block');
    document.getElementById('resetGameButtonContainer').style.display = 'block'; // Show reset button container
    updateUpgradeButtons();
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
        colonies[colonyIndex].pixels.forEach(p => p.randomMoveCount = 0);
        updateColonyStats();
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
                    { type: 'food', level: colony.upgradeLevel, cost: calculateUpgradeCost(colony.upgradeLevel) },
                    { type: 'pixel', level: colony.pixelUpgradeLevel, cost: calculateUpgradeCost(colony.pixelUpgradeLevel) },
                    { type: 'focus', level: colony.focusUpgradeLevel, cost: calculateUpgradeCost(colony.focusUpgradeLevel) },
                    { type: 'strength', level: colony.strengthUpgradeLevel, cost: calculateUpgradeCost(colony.strengthUpgradeLevel) }
                ];
                const affordableUpgrades = possibleUpgrades.filter(upg => upg.level < 8 && colony.gold >= upg.cost);
                if (affordableUpgrades.length === 0) {
                    canAffordAnUpgrade = false;
                    break; 
                }
                affordableUpgrades.sort((a, b) => a.cost - b.cost);
                const bestUpgradeToBuy = affordableUpgrades[0];
                colony.gold -= bestUpgradeToBuy.cost;
                if (bestUpgradeToBuy.type === 'food') colony.upgradeLevel++;
                else if (bestUpgradeToBuy.type === 'pixel') colony.pixelUpgradeLevel++;
                else if (bestUpgradeToBuy.type === 'focus') colony.focusUpgradeLevel++;
                else if (bestUpgradeToBuy.type === 'strength') colony.strengthUpgradeLevel++;
                console.log(`AI Colony ${colony.color} purchased ${bestUpgradeToBuy.type} upgrade. Gold remaining: ${colony.gold}`);
            }
            updateColonyStats();
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

    resetGame(); // Initialize and start the first round
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('initializeGameButton').addEventListener('click', initializeGameSetup);
    document.getElementById('resetGame').addEventListener('click', resetGame);
    // Note: updateColonyStats and startGame are now called via initializeGameSetup -> resetGame
});
