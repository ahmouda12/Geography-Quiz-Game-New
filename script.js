let stateInfo = {};
let stateInfo2 = {};
let score = 0;
let clickCount = 0;
let gameTimerInterval = null;
let gameAudioInterval = null;
let secondsRemaining = 120;
let stateInfoLength;
let stateInfoLength2;
let currentPlayerName = "";
let savedPlayerName = "";
let leaderboardEntries = [];
let leaderboardStorageReady = true;
let gameStartTime = 0;
let gameElapsedSeconds = 0;
let winnerRecorded = false;
const leaderboardStorageKey = "geographyQuizLeaderboard";
const playerNameStorageKey = "geographyQuizPlayerName";
const leaderboardResetPassword = "1234";
const hasBrowserEnvironment = typeof window !== "undefined" && typeof document !== "undefined" && typeof $ !== "undefined";
let soundContext = null;
let gameplayAudioRequested = false;
let completionAudioRequested = false;

function prepareGameAudio() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    console.error("Web Audio is unavailable; gameplay audio fallback cannot be started.");
    return;
  }
  if (!soundContext) soundContext = new AudioContextConstructor();
  if (soundContext.state === "suspended") {
    soundContext.resume().catch(function(error) {
      console.error("Unable to enable gameplay audio:", error);
    });
  }
}

function playSoftTone(notes) {
  if (!soundContext) prepareGameAudio();
  if (!soundContext) return;

  const scheduleNotes = function() {
    const startAt = soundContext.currentTime;
    notes.forEach(function(note) {
      const oscillator = soundContext.createOscillator();
      const volume = soundContext.createGain();
      const noteStart = startAt + note.delay;
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequency;
      volume.gain.setValueAtTime(0.0001, noteStart);
      volume.gain.exponentialRampToValueAtTime(0.1, noteStart + 0.03);
      volume.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.35);
      oscillator.connect(volume);
      volume.connect(soundContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.36);
    });
  };

  if (soundContext.state === "suspended") {
    soundContext.resume().then(scheduleNotes).catch(function(error) {
      console.error("Unable to resume gameplay audio:", error);
    });
    return;
  }
  scheduleNotes();
}

function startFallbackGameplayAudio() {
  if (!gameplayAudioRequested || gameAudioInterval) return;
  const playPhrase = function() {
    playSoftTone([
      {frequency: 523, delay: 0},
      {frequency: 659, delay: 0.3},
      {frequency: 587, delay: 0.6},
      {frequency: 784, delay: 0.9}
    ]);
  };
  playPhrase();
  gameAudioInterval = setInterval(playPhrase, 8000);
}

function playGameplayAudio() {
  gameplayAudioRequested = true;
  prepareGameAudio();
  const audio = document.getElementById("gameplay-audio");
  audio.volume = 0.2;
  audio.currentTime = 0;
  const playback = audio.play();
  if (playback && typeof playback.catch === "function") {
    playback.catch(function(error) {
      console.error("Unable to play gameplay audio:", error);
      startFallbackGameplayAudio();
    });
  }
}

function stopGameplayAudio() {
  gameplayAudioRequested = false;
  clearInterval(gameAudioInterval);
  gameAudioInterval = null;
  const audio = document.getElementById("gameplay-audio");
  audio.pause();
  audio.currentTime = 0;
}

function playCompletionAudio() {
  completionAudioRequested = true;
  const audio = document.getElementById("completion-audio");
  audio.volume = 0.8;
  audio.currentTime = 0;
  const playback = audio.play();
  if (playback && typeof playback.catch === "function") {
    playback.catch(function(error) {
      console.error("Unable to play completion audio:", error);
      if (completionAudioRequested) {
        playSoftTone([
          {frequency: 523, delay: 0},
          {frequency: 659, delay: 0.16},
          {frequency: 784, delay: 0.32},
          {frequency: 1047, delay: 0.48}
        ]);
      }
    });
  }
}

function stopCompletionAudio() {
  completionAudioRequested = false;
  const audio = document.getElementById("completion-audio");
  audio.pause();
  audio.currentTime = 0;
}

let usaInfo = {HI:"Hawaii",AK:"Alaska",FL:"Florida",SC:"South Carolina",GA:"Georgia",AL:"Alabama",NC:"North Carolina",
TN:"Tennessee",RI:"Rhode Island",CT:"Connecticut",MA:"Massachusetts",ME:"Maine",NH:"New Hampshire",VT:"Vermont",
NY:"New York",NJ:"New Jersey",PA:"Pennsylvania",DE:"Delaware",MD:"Maryland",WV:"West Virginia",KY:"Kentucky",
OH:"Ohio",MI:"Michigan",WY:"Wyoming",MT:"Montana",ID:"Idaho",WA:"Washington",TX:"Texas",CA:"California",AZ:"Arizona",
NV:"Nevada",UT:"Utah",CO:"Colorado",NM:"New Mexico",OR:"Oregon",ND:"North Dakota",SD:"South Dakota",NE:"Nebraska",
IA:"Iowa",MS:"Mississippi",IN:"Indiana",IL:"Illinois",MN:"Minnesota",WI:"Wisconsin",MO:"Missouri",AR:"Arkansas",
OK:"Oklahoma",KS:"Kansas",LA:"Louisiana",VA:"Virginia"};


//hide all non-USA content on load and set up the single-region game flow
if (hasBrowserEnvironment) {
  applyStateFlagShapes();

  $(window).on("load", function() {
    loadSavedPlayerData();
    renderLeaderboard();
    $("#usa-map").hide();
    $("#click-start,#start-game,#state-id,#score").hide();
    let pendingDuplicatePlayerName = "";

    $("#playerNameModal").on("show.bs.modal", function() {
      $("#quiz-name-entry").val("");
      $("#player-name-form").show();
      $("#duplicate-player-confirm").hide();
      pendingDuplicatePlayerName = "";
    });
    $(".modal").on("shown.bs.modal", function() {
      $(this).find("form:visible input:visible, form:visible textarea:visible, form:visible select:visible").first().trigger("focus");
    });
    gameStartBinding();
    gameRestartBinding();
    usaMapBinding();
    $("#hide-usa").trigger("click");
    $("#start-quiz").on("click", function() {
      $("#quiz-name-entry").val("");
      $("#playerNameModal").modal("show");
    });

    function startGameWithPlayerName(playerName) {
      currentPlayerName = playerName;
      savedPlayerName = playerName;
      if (!savePlayerName()) return;
      playGameplayAudio();
      $("#playerNameModal").one("hidden.bs.modal", function() {
        $("#hide-usa").trigger("click");
        $("#start-game").trigger("click");
      });
      $("#playerNameModal").modal("hide");
    }

    $("#player-name-form").on("submit", function(event) {
      event.preventDefault();
      const playerName = $("#quiz-name-entry").val().trim();
      if (!playerName) {
        $("#quiz-name-entry").trigger("focus");
        return;
      }

      const matchingWinner = leaderboardEntries.find(function(entry) {
        return entry.name.trim().toLocaleLowerCase() === playerName.toLocaleLowerCase();
      });
      if (matchingWinner) {
        pendingDuplicatePlayerName = playerName;
        $("#duplicate-player-message").text(
          playerName + " already has a leaderboard result. Replacing it will remove the saved result for this name. Continue?"
        );
        $("#player-name-form").hide();
        $("#duplicate-player-confirm").show();
        $("#replace-existing-result").trigger("focus");
        return;
      }

      startGameWithPlayerName(playerName);
    });
    $("#keep-existing-result").on("click", function() {
      pendingDuplicatePlayerName = "";
      $("#duplicate-player-confirm").hide();
      $("#player-name-form").show();
      $("#quiz-name-entry").trigger("focus");
    });
    $("#replace-existing-result").on("click", function() {
      const playerName = pendingDuplicatePlayerName;
      if (!playerName) return;

      leaderboardEntries = leaderboardEntries.filter(function(entry) {
        return entry.name.trim().toLocaleLowerCase() !== playerName.toLocaleLowerCase();
      });
      try {
        localStorage.setItem(leaderboardStorageKey, JSON.stringify(leaderboardEntries));
        renderLeaderboard();
      } catch (error) {
        leaderboardStorageReady = false;
        showStorageMessage("The existing result could not be replaced.", true);
        console.error("Unable to replace leaderboard result:", error);
        $("#duplicate-player-confirm").hide();
        $("#player-name-form").show();
        return;
      }

      pendingDuplicatePlayerName = "";
      $("#duplicate-player-confirm").hide();
      $("#player-name-form").show();
      startGameWithPlayerName(playerName);
    });
    $("#cancel-player-name").on("click", stopGameplayAudio);
    $("#cancel-quiz").on("click", function() {
      $("#close").trigger("click");
    });
    $("#open-reset").on("click", function() {
      $("#reset-password").val("");
      $("#reset-error").text("");
      $("#resetModal").modal("show");
    });
    $("#reset-form").on("submit", function(event) {
      event.preventDefault();
      if ($("#reset-password").val() !== leaderboardResetPassword) {
        $("#reset-error").text("Incorrect password.");
        $("#reset-password").trigger("focus");
        return;
      }
      resetSavedPlayerData();
    });
    document.body.classList.remove("ui-loading");
  });
}

function loadSavedPlayerData() {
  try {
    savedPlayerName = localStorage.getItem(playerNameStorageKey) || "";
    const savedLeaderboard = localStorage.getItem(leaderboardStorageKey);
    leaderboardEntries = savedLeaderboard ? JSON.parse(savedLeaderboard) : [];
    if (!Array.isArray(leaderboardEntries) || leaderboardEntries.some(function(entry) {
      return typeof entry.name !== "string" || typeof entry.score !== "number" ||
        typeof entry.elapsedSeconds !== "number" || typeof entry.completedAt !== "number";
    })) {
      throw new Error("Saved leaderboard data is invalid.");
    }
  } catch (error) {
    leaderboardStorageReady = false;
    showStorageMessage("Saved player data could not be loaded. The leaderboard cannot be updated.", true);
    console.error("Unable to load saved player data:", error);
    leaderboardEntries = [];
    savedPlayerName = "";
  }
}

function savePlayerName() {
  if (!leaderboardStorageReady) return false;
  try {
    localStorage.setItem(playerNameStorageKey, savedPlayerName);
    showStorageMessage("", false);
    return true;
  } catch (error) {
    leaderboardStorageReady = false;
    showStorageMessage("Your name could not be saved in this browser.", true);
    console.error("Unable to save player name:", error);
    return false;
  }
}

function renderLeaderboard() {
  const tbody = $("#leaderboard-entries").empty();
  if (!leaderboardEntries.length) {
    const row = $("<tr>");
    row.append($("<td>").attr("colspan", 4).text("No winners yet."));
    tbody.append(row);
    return;
  }

  leaderboardEntries.slice(0, 3).forEach(function(entry, index) {
    const row = $("<tr>");
    row.append($("<td>").text(index + 1));
    row.append($("<td>").text(entry.name));
    row.append($("<td>").text(entry.score + "%"));
    row.append($("<td>").text(formatElapsedTime(entry.elapsedSeconds)));
    tbody.append(row);
  });
}

function formatElapsedTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

function showStorageMessage(message, isError) {
  $("#storage-message").text(message).toggleClass("error", Boolean(isError));
}

function recordWinner(name, finalScore, elapsedSeconds) {
  if (!leaderboardStorageReady) return;
  leaderboardEntries.push({
    name: name,
    score: finalScore,
    elapsedSeconds: elapsedSeconds,
    completedAt: Date.now()
  });
  leaderboardEntries.sort(function(first, second) {
    return second.score - first.score ||
      first.elapsedSeconds - second.elapsedSeconds ||
      first.completedAt - second.completedAt;
  });
  leaderboardEntries = leaderboardEntries.slice(0, 3);

  try {
    localStorage.setItem(leaderboardStorageKey, JSON.stringify(leaderboardEntries));
    renderLeaderboard();
    showStorageMessage("", false);
  } catch (error) {
    leaderboardStorageReady = false;
    showStorageMessage("Your win could not be saved in this browser.", true);
    console.error("Unable to save leaderboard:", error);
  }
}

function resetSavedPlayerData() {
  try {
    localStorage.removeItem(leaderboardStorageKey);
    localStorage.removeItem(playerNameStorageKey);
    leaderboardStorageReady = true;
    leaderboardEntries = [];
    savedPlayerName = "";
    currentPlayerName = "";
    renderLeaderboard();
    showStorageMessage("", false);
    $("#resetModal").modal("hide");
  } catch (error) {
    showStorageMessage("Saved player data could not be erased.", true);
    console.error("Unable to erase saved player data:", error);
  }
}

function applyStateFlagShapes() {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const measuringSvg = document.createElementNS(svgNamespace, "svg");
  measuringSvg.setAttribute("width", "1");
  measuringSvg.setAttribute("height", "1");
  measuringSvg.style.cssText = "position:fixed;left:-10px;top:0;overflow:visible";
  const measuringPath = document.createElementNS(svgNamespace, "path");
  measuringSvg.append(measuringPath);
  document.body.append(measuringSvg);

  $(".state-flag:not(.usa-flag)").each(function() {
    const stateKey = this.dataset.stateKey;
    const statePath = document.getElementById(stateKey);
    if (!statePath) {
      measuringSvg.remove();
      throw new Error("Missing map outline for state flag: " + stateKey);
    }

    const pathData = statePath.getAttribute("d");
    measuringPath.setAttribute("d", pathData);
    const bounds = measuringPath.getBBox();
    const flagHeight = parseFloat(getComputedStyle(this).height);
    const svg = `<svg xmlns="${svgNamespace}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" preserveAspectRatio="none"><path fill="white" d="${pathData}"/></svg>`;
    this.style.setProperty("--state-flag-mask", `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    this.style.width = `${flagHeight * bounds.width / bounds.height}px`;
  });

  measuringSvg.remove();
  document.body.classList.add("flags-ready");
}

// show the United States map and initialize the state list
function usaMapBinding() {
  $("#hide-usa").off("click.usaMap").on("click.usaMap", function() {
    $("#usa-map").show();
    stateInfo = JSON.parse(JSON.stringify(usaInfo));
    stateInfo2 = JSON.parse(JSON.stringify(usaInfo));
    secondsRemaining = 120;
    $("#timer").text("02m 00s");
    info();
  });
}

// get country or state info from thier objects
function info() {
  stateInfoLength = Object.keys(stateInfo).length;
  stateInfoLength2 = Object.keys(stateInfo2).length;
};

// start the game by setting up variables and calling functions
function gameStartBinding(){
  $("#start-game").click(function(e) {
    clickCount = 0;
    score = 0;
    gameStartTime = Date.now();
    gameElapsedSeconds = 0;
    winnerRecorded = false;
    $("#start-game").hide();
    $("#click-start,#score").show();
    $("#click-start").find("#start-game-text").addClass("fadeIn-color pulsing-state-name");
    $("#score").find("#score-number").addClass("score-color");
    $("#score").find("#percentage").addClass("score-color");
    $("#score-number").text("0");
    selectName();
    checkMatch();
    // set a timer
    gameTimerInterval = setInterval(function() {
      secondsRemaining = Math.max(0, secondsRemaining - 1);
      const remainingMinutes = Math.floor(secondsRemaining / 60);
      const remainingSeconds = String(secondsRemaining % 60).padStart(2, "0");
      $("#timer").text(String(remainingMinutes).padStart(2, "0") + "m " + remainingSeconds + "s");
      if (secondsRemaining === 0 || stateInfoLength === 0) {
        gameOver();
        return;
      }
      if (secondsRemaining <= 10) {
        $("#score").find("#timer").addClass("animated infinite flash flash-color");
      }
    }, 1000);
})};

// select random country or state name for the user
function selectName() {
  let key = Object.keys(stateInfo);
  if (key.length === 0) {
    $("#start-game-text").text("All states identified!");
    gameOver();
    return "";
  }
  let randomIndex = Math.floor(Math.random() * key.length);
  randomKey = key[randomIndex];
  randomValue = stateInfo[randomKey]
  $("#start-game-text").text(randomValue);
  $("#state-id").text(randomKey);
  return randomValue;
}

// match rendom name with guessed name and return score based on number of click count
function checkMatch() {
  $("path").bind("click", function(e) {
    let guessedName = $(e.target).data("name");
    let guessedId = e.currentTarget.id;
    let newName = $("#start-game-text").text();
    let newId = $("#state-id").text();
    if (!stateInfo[guessedId]) return;

    if (guessedName === newName) {
      const pointsForState = 100 / stateInfoLength2;
      score = Math.min(100, score + pointsForState * Math.max(0, 1 - clickCount / 2));
      e.currentTarget.classList.remove("hint-highlight");
      $(e.currentTarget).addClass(clickCount === 0 ? "first-click" : clickCount === 1 ? "second-click" : "third-click");
      delete stateInfo[newId];
      stateInfoLength = Object.keys(stateInfo).length;
      $("#score-number").text(Math.round(score));
      clickCount = 0;
      selectName();
    }
    else {
      clickCount++;
      if (clickCount === 2) {
        blinker();
      }
    }
})};

// make random selected country or state blink for hint
function blinker() {
  let newId = $("#state-id").text();
  const target = document.getElementById(newId);
  if (!target) return;
  target.classList.add("hint-highlight");
};

// declare score with different categories based on the user answers
function gameOver() {
  if (winnerRecorded) return;
  winnerRecorded = true;
  gameElapsedSeconds = Math.max(0, Math.floor((Date.now() - gameStartTime) / 1000));
  clearInterval(gameTimerInterval);
  gameTimerInterval = null;
  stopGameplayAudio();
  if (currentPlayerName) {
    recordWinner(currentPlayerName, Math.round(score), gameElapsedSeconds);
  }
  $("#click-start,#score").hide();
  $("#myModal").modal({backdrop: "static"});
  $("path").removeClass("first-click second-click third-click hint-highlight");
  if (stateInfoLength === 0){
    playCompletionAudio();
    // console.log("You are done!");
    $("#result-header").text("You are done!");
    $("#result-header").addClass("ec ec-clap emoji");
    $("#final-score").text("Your score: " + score + "%");
    switch (true) {
      case (score >= 85):
      $("#comment").text("Excellent job!");
      $("#final-score").addClass("ec ec-muscle emoji");
      $("#comment").addClass("ec ec-loudspeaker emoji-comment");
      break;
      case (score < 85 && score >= 70):
      $("#comment").text("Good job!");
      $("#final-score").addClass("ec ec-plus1 emoji");
      $("#comment").addClass("ec ec-loudspeaker emoji-comment");
      break;
      case (score < 70 && score >= 55):
      $("#comment").text("You could be better!");
      $("#final-score").addClass("ec ec-slightly-smiling-face emoji");
      $("#comment").addClass("ec ec-loudspeaker emoji-comment");
      break;
      case (score < 55):
      $("#comment").text("You should study geography!");
      $("#final-score").addClass("ec ec-thinking emoji");
      $("#comment").addClass("ec ec-loudspeaker emoji-comment");
      break;
    }
  }
  else {
    // console.log("Game over!");
    $("#result-header").text("Game over!");
    $("#result-header").addClass("ec ec-lock emoji");
    $("#final-score").text("Time is up!");
    $("#final-score").addClass("ec ec-stopwatch emoji");
    $("#comment").text("You have " + (stateInfoLength2 - stateInfoLength) + 
    " answers out of " + stateInfoLength2 + "!");
    $("#comment").addClass("ec ec-loudspeaker emoji-comment");
  }
}

// restart the game and reset all variable and classes added and call all functions again
function gameRestartBinding() {
  $("#close").click(function(e) {
    score = 0;
    clickCount = 0;
    winnerRecorded = false;
    currentPlayerName = "";
    gameElapsedSeconds = 0;
    clearInterval(gameTimerInterval);
    gameTimerInterval = null;
    stopGameplayAudio();
    stopCompletionAudio();
    $("path").off();
    $("#click-start,#start-game,#state-id,#score").hide();
    $("#start-game-text").text("start button to start the game");
    $("#score-number").text("0");
    $("path").removeClass("first-click second-click third-click hint-highlight");
    $("#score").find("#timer").removeClass("animated infinite flash flash-color");
    $("#score").find("#score-number").removeClass("score-color");
    $("#score").find("#percentage").removeClass("score-color");
    $("#click-start").find("#start-game-text").removeClass("fadeIn-color pulsing-state-name");
    $("#result-header").removeClass("ec ec-lock ec-clap emoji");
    $("#final-score").removeClass("ec ec-stopwatch ec-muscle ec-plus1 ec-thinking ec-slightly-smiling-face emoji");
    $("#comment").removeClass("ec ec-loudspeaker");
    info();
    usaMapBinding();
  })
}