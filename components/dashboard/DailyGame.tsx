"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw, Trophy, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import DailyCodeleShare from "@/components/practice/DailyCodeleShare";
import CodeleQuestModal from "@/components/practice/CodeleQuestModal";
import confetti from "canvas-confetti";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { useUser } from "@/context/UserContext";
import { createClient } from "@/utils/supabase/client";
import { useFeedback } from "@/hooks/useFeedback";

// Valid words for guesses — includes all puzzle words + common English words
// so players are never blocked on a reasonable guess attempt
const VALID_WORDS = new Set([
    // All puzzle words (must stay in sync with DAILY_WORDS in task-actions.ts)
    "REACT", "STACK", "QUEUE", "ASYNC", "CONST", "AWAIT", "FETCH", "BUILD", "DEBUG", "LOGIC",
    "ARRAY", "CLASS", "ERROR", "FLOAT", "FRAME", "INDEX", "INPUT", "PARSE", "QUERY", "ROUTE",
    "STATE", "TABLE", "TOKEN", "UNION", "WATCH", "YIELD", "CACHE", "HOOKS", "PROPS", "MODEL",
    "CLONE", "SCOPE", "BYTES", "MUTEX", "PROXY", "STORE", "GRAPH", "REGEX", "STRIP", "SPLIT",
    "SLICE", "CHUNK", "TUPLE", "SUPER", "THROW", "TYPED", "LOCAL", "WRITE", "SERVE", "SPAWN",
    "RETRY", "APPLY", "MACRO", "PRINT", "TRAIT", "SHELL", "DELTA", "PIVOT", "SHIFT", "MONAD",
    "NONCE", "LATCH", "EVENT", "FIBER", "INODE", "ALLOC", "PATCH", "ABORT", "BLOCK", "BREAK",
    "CATCH", "CHAIN", "CHECK", "CLEAN", "CODEC", "COUNT", "TASKS", "FLAGS", "PORTS", "BLOBS",
    "FORKS", "INFIX", "JOINS", "LINES", "READS", "ZEROS", "LEXER", "ARITY", "WHILE", "UNTIL",
    "LOOPS", "MERGE", "NODES", "LINKS", "TREES", "HEAPS", "GREPS", "TESTS", "MOCKS", "STUBS",
    "TYPES", "PATHS", "EDITS", "DIFFS", "REDIS", "TIMER", "CALLS", "CODES", "GATES", "MIXIN",
    "TRUNC", "STDIN", "VAULT", "DTYPE", "XPATH", "DATUM", "DIGIT", "FIELD", "INNER", "OUTER",
    "USING", "MATCH", "DEPTH", "WIDTH", "ALIGN", "CHILD", "AFTER", "PRIOR", "LOWER", "UPPER",
    "GRANT", "RANGE", "GROUP", "ORDER", "LIMIT", "ALIAS", "DEFER", "EAGER", "FLUSH", "GUARD",
    "HOIST", "BENCH", "CLOSE", "DRAIN", "EMBED", "FLOOD", "GRUNT",
    // Common 5-letter English words as valid guesses
    "ABOUT", "ABOVE", "ABUSE", "ACTOR", "ACUTE", "ADMIT", "ADOPT", "ADULT", "AFTER", "AGAIN",
    "AGENT", "AGREE", "AHEAD", "ALARM", "ALBUM", "ALERT", "ALIKE", "ALIGN", "ALIVE", "ALLEY",
    "ALLOW", "ALONE", "ALONG", "ALTER", "ANGEL", "ANGER", "ANGLE", "ANIME", "ANNEX", "ANTIC",
    "APART", "APPLE", "APPLY", "ARENA", "ARGUE", "ARISE", "ARMOR", "ASIDE", "ASSET", "ATLAS",
    "ATTIC", "AUDIO", "AUDIT", "AUGUR", "AUNTS", "AVOID", "AWAKE", "AWARD", "AWFUL", "BADLY",
    "BASIC", "BASIS", "BEAMS", "BEARD", "BEAST", "BEGIN", "BEING", "BELOW", "BENCH", "BIRTH",
    "BITES", "BLAND", "BLANK", "BLAST", "BLAZE", "BLEND", "BLESS", "BLINK", "BLOWN", "BOARD",
    "BONUS", "BOOST", "BOUND", "BRAIN", "BRAND", "BRAVE", "BRAVO", "BREAD", "BRIEF", "BRING",
    "BROAD", "BROKE", "BROWN", "BRUSH", "BRUTE", "BUDDY", "BUILT", "BURST", "BUYER", "CABIN",
    "CARDS", "CARGO", "CARRY", "CAUSE", "CEASE", "CHAIR", "CHALK", "CHARM", "CHART", "CHASE",
    "CHEST", "CHIEF", "CLEAN", "CLEAR", "CLERK", "CLICK", "CLIFF", "CLIMB", "CLING", "CLOUD",
    "COACH", "COLOR", "COMIC", "CORAL", "COULD", "COUNT", "COVER", "CRASH", "CRAZY", "CREEK",
    "CRIME", "CROSS", "CROWD", "CROWN", "CRUSH", "CURVE", "CYCLE", "DANCE", "DEALT", "DECAY",
    "DELAY", "DEMON", "DENSE", "DEPOT", "DEPTH", "DEVIL", "DIRTY", "DISCO", "DOING", "DOUBT",
    "DOUGH", "DRAFT", "DRAIN", "DRAMA", "DRANK", "DRAWN", "DREAM", "DRESS", "DRIED", "DRINK",
    "DRIVE", "DROVE", "DRUNK", "DRYER", "DWELT", "DYING", "EAGER", "EARLY", "EARTH", "EIGHT",
    "ELITE", "EMPTY", "ENTER", "EQUAL", "ESSAY", "EVEN", "EVERY", "EXACT", "EXIST", "EXTRA",
    "FAINT", "FAIRY", "FAITH", "FANCY", "FATAL", "FAULT", "FEAST", "FEWER", "FIFTH", "FIGHT",
    "FINAL", "FIRST", "FIXED", "FLAME", "FLANK", "FLARE", "FLASH", "FLAIR", "FLEET", "FLESH",
    "FLICK", "FLOCK", "FLOOR", "FLUTE", "FOCUS", "FORCE", "FORGE", "FORTH", "FORUM", "FOUND",
    "FRESH", "FRONT", "FROST", "FRUIT", "FULLY", "FUNNY", "GIANT", "GIVEN", "GLASS", "GLIDE",
    "GLOOM", "GLOSS", "GLYPH", "GOING", "GRACE", "GRADE", "GRAIN", "GRAND", "GRASP", "GRASS",
    "GRATE", "GRAVE", "GREAT", "GREED", "GREET", "GRIEF", "GRIPE", "GROAN", "GROIN", "GROSS",
    "GROUT", "GROVE", "GROWL", "GUESS", "GUIDE", "GUILD", "GUILT", "GUISE", "GUSTO", "HAVOC",
    "HEART", "HEAVY", "HENCE", "HERBS", "HINGE", "HIRED", "HONOR", "HOTEL", "HOUSE", "HUMAN",
    "HUMOR", "HURRY", "HYPER", "IDEAL", "IMPLY", "INDIE", "INPUT", "IRONY", "ISSUE", "IVORY",
    "JUDGE", "JUICE", "JUICY", "JUMBO", "KARMA", "KINKY", "KNIFE", "KNOCK", "KNOWN", "LABEL",
    "LARGE", "LASER", "LATER", "LEARN", "LEAVE", "LEGAL", "LEMON", "LEVEL", "LIGHT", "LINER",
    "LIVER", "LLAMA", "LODGE", "LOOSE", "LOVER", "LOYAL", "LUCKY", "LYING", "MAGIC", "MAJOR",
    "MAKER", "MANOR", "MAPLE", "MARCH", "MEANT", "MEDIA", "METAL", "MINOR", "MINUS", "MIXER",
    "MONEY", "MONTH", "MORAL", "MOUNT", "MOUSE", "MOUTH", "MOVIE", "MUDDY", "MUSHY", "MUSIC",
    "NAIVE", "NERVE", "NEVER", "NIGHT", "NOBLE", "NOISE", "NORTH", "NOTED", "NOVEL", "NURSE",
    "OCCUR", "OFFER", "OFTEN", "OMEGA", "ONSET", "OPERA", "ORBIT", "ORGAN", "OUNCE", "OUGHT",
    "OVARY", "PAINT", "PANIC", "PANEL", "PAPER", "PARTY", "PASTA", "PAUSE", "PEACE", "PERCH",
    "PERIL", "PHASE", "PHONE", "PHOTO", "PIANO", "PIECE", "PILOT", "PITCH", "PLACE", "PLAIN",
    "PLANE", "PLANT", "PLATE", "PLAZA", "PLEAD", "PLUMB", "PLUME", "PLUNK", "POINT", "POLAR",
    "POPPY", "POSED", "POUCH", "POWER", "PRESS", "PRICE", "PRIDE", "PRIME", "PRIZE", "PRONE",
    "PROOF", "PROSE", "PROUD", "PROVE", "PROWL", "PSALM", "PULSE", "PUPIL", "PURSE", "PUSHY",
    "QUEEN", "QUICK", "QUIET", "QUITE", "QUOTA", "QUOTE", "RADAR", "RADIO", "RAISE", "RALLY",
    "RAPID", "RATIO", "REACH", "REALM", "REBEL", "REFER", "REIGN", "REMIX", "REPAY", "REPEL",
    "RERUN", "RIDER", "RIDGE", "RIGHT", "RISKY", "RIVAL", "RIVER", "ROBIN", "ROCKY", "ROUGE",
    "ROUGH", "ROUND", "ROYAL", "RUGBY", "RULER", "RUNNY", "RURAL", "SADLY", "SAINT", "SAUCE",
    "SAVVY", "SCENE", "SCOUT", "SENSE", "SERVE", "SHADE", "SHAKE", "SHAME", "SHAPE", "SHARE",
    "SHARP", "SHELF", "SHIFT", "SHINE", "SHIRT", "SHOOT", "SHORE", "SHORT", "SHOUT", "SIGHT",
    "SINCE", "SIXTH", "SIXTY", "SKULL", "SLATE", "SLEEK", "SLEEP", "SLEET", "SLEPT", "SLIDE",
    "SLIME", "SLOPE", "SLOTH", "SLUMP", "SMALL", "SMART", "SMILE", "SNACK", "SNAKE", "SOLAR",
    "SOLID", "SOLVE", "SONIC", "SORRY", "SOUTH", "SPACE", "SPARK", "SPEAK", "SPEAR", "SPEED",
    "SPEND", "SPICE", "SPIKE", "SPINE", "SPITE", "SPEAK", "SPREE", "SQUAD", "STAGE", "STAKE",
    "STALE", "STALL", "STAMP", "STAND", "STARE", "START", "STEAL", "STEEL", "STEEP", "STEER",
    "STOKE", "STONE", "STORM", "STORY", "STOUT", "STOVE", "STRAP", "STRAW", "STRAY", "STRIP",
    "STUDY", "STYLE", "SUGAR", "SWAMP", "SWEAR", "SWEAT", "SWEPT", "SWIFT", "SWIPE", "SWIRL",
    "TASTE", "TEACH", "TEARS", "TEETH", "TEMPO", "TENSE", "TENTH", "TERMS", "THEFT", "THEIR",
    "THERE", "THESE", "THICK", "THING", "THINK", "THIRD", "THORN", "THOSE", "THREE", "THROB",
    "TIGER", "TIGHT", "TITLE", "TOAST", "TODAY", "TOUGH", "TOWEL", "TOWER", "TOXIC", "TRACK",
    "TRADE", "TRAIL", "TRAIN", "TRAM", "TREND", "TRIAL", "TRIBE", "TRICK", "TRIED", "TROUT",
    "TROVE", "TRUCK", "TRULY", "TRUNK", "TRUST", "TRUTH", "TWIST", "ULTRA", "UNDER", "UNION",
    "UNITY", "UNTIL", "UNZIP", "USAGE", "USUAL", "UTTER", "VALID", "VALUE", "VALOR", "VALVE",
    "VIDEO", "VIGOR", "VIRAL", "VIRUS", "VISIT", "VISTA", "VITAL", "VIVID", "VOICE", "VOILA",
    "VOTER", "WALTZ", "WASTE", "WATER", "WEARY", "WEBSITE", "WEDGE", "WEIRD", "WHEEL", "WHERE",
    "WHICH", "WHILE", "WHIRL", "WHISK", "WHITE", "WHOLE", "WIDER", "WITCH", "WOMAN", "WOMEN",
    "WORLD", "WORRY", "WORST", "WORTH", "WOUND", "WRATH", "WRONG", "WROTE", "YACHT", "YEARS",
    "YOUNG", "YOUTH", "ZONAL", "ZONED", "ZONES",
]);


export default function DailyGame({ isOpen, onClose, inline = false, onComplete }: { isOpen: boolean; onClose: () => void; inline?: boolean; onComplete?: () => void }) {
    const { trigger } = useFeedback();
    const { user, refreshProfile } = useUser();
    const [solution, setSolution] = useState("");
    const [guesses, setGuesses] = useState<string[]>(Array(6).fill(""));
    const [currentGuess, setCurrentGuess] = useState("");
    const [currentRow, setCurrentRow] = useState(0);
    const [gameState, setGameState] = useState<"playing" | "won" | "lost">("playing");
    const [shakeRow, setShakeRow] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [letterStatuses, setLetterStatuses] = useState<Record<string, "correct" | "present" | "absent">>({});

    const [puzzleId, setPuzzleId] = useState<string | null>(null);
    const [questReward, setQuestReward] = useState<{ xp: number; coins: number } | null>(null);
    const [questModalDismissed, setQuestModalDismissed] = useState(false);

    useEffect(() => {
        const fetchDailyPuzzle = async () => {
            // Auto-creates today's puzzle if it doesn't exist yet
            const { ensureDailyPuzzle } = await import('@/actions/task-actions');
            const puzzle = await ensureDailyPuzzle();

            if (puzzle) {
                setSolution(puzzle.word.toUpperCase());
                setPuzzleId(puzzle.id);

                // Check if user has already played today
                if (user) {
                    const { createClient } = await import('@/utils/supabase/client');
                    const supabase = createClient();
                    const { data: attempt } = await supabase
                        .from('user_puzzle_attempts')
                        .select('status, attempts, last_guess')
                        .eq('user_id', user.id)
                        .eq('puzzle_id', puzzle.id)
                        .single();

                    if (attempt && attempt.status !== 'playing') {
                        setGameState(attempt.status as "won" | "lost");
                    }
                }
            }
        };
        fetchDailyPuzzle();
    }, [user]);

    useEffect(() => {
        if (!isOpen && !inline) return;

        const handleKey = (e: KeyboardEvent) => {
            if (gameState !== "playing") return;

            if (e.key === "Enter") {
                if (currentGuess.length !== 5) {
                    trigger('error');
                    setShakeRow(true);
                    setTimeout(() => setShakeRow(false), 500);
                    return;
                }
                trigger('click');
                submitGuess();
            } else if (e.key === "Backspace") {
                trigger('pop');
                setCurrentGuess((prev) => prev.slice(0, -1));
            } else if (/^[a-zA-Z]$/.test(e.key)) {
                if (currentGuess.length < 5) {
                    trigger('pop');
                    setCurrentGuess((prev) => (prev + e.key).toUpperCase());
                }
            }
        };

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, currentGuess, gameState, inline]);

    const submitGuess = () => {
        // Validate word is in the valid word list
        if (!VALID_WORDS.has(currentGuess)) {
            trigger('error');
            setErrorMessage(`"${currentGuess}" is not part of the word list`);
            setShakeRow(true);
            setTimeout(() => {
                setShakeRow(false);
                setErrorMessage("");
            }, 2000);
            return;
        }

        const newGuesses = [...guesses];
        newGuesses[currentRow] = currentGuess;
        setGuesses(newGuesses);

        // Update letter statuses for keyboard
        const newStatuses = { ...letterStatuses };
        for (let i = 0; i < currentGuess.length; i++) {
            const letter = currentGuess[i];
            if (solution[i] === letter) {
                newStatuses[letter] = "correct";
            } else if (solution.includes(letter) && newStatuses[letter] !== "correct") {
                newStatuses[letter] = "present";
            } else if (!solution.includes(letter)) {
                newStatuses[letter] = "absent";
            }
        }
        setLetterStatuses(newStatuses);

        const checkGameEnd = async (status: "won" | "lost", finalAttempts: number, finalGuess: string) => {
            const { createClient } = await import('@/utils/supabase/client');
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Look up today's puzzle ID directly — don't rely on puzzleId state
            // which can be null if the server-side auto-generation failed
            const todayStr = new Date().toISOString().split('T')[0];
            let resolvedPuzzleId = puzzleId;

            if (!resolvedPuzzleId) {
                const { data: puzzle } = await supabase
                    .from('daily_puzzles')
                    .select('id')
                    .eq('puzzle_date', todayStr)
                    .maybeSingle();
                resolvedPuzzleId = puzzle?.id ?? null;
            }

            if (!resolvedPuzzleId) {
                console.warn('checkGameEnd: no puzzle found for today, attempt not recorded.');
                return;
            }

            // Record the attempt result
            const { error: upsertError } = await supabase.from('user_puzzle_attempts').upsert({
                user_id: user.id,
                puzzle_id: resolvedPuzzleId,
                attempts: finalAttempts,
                status: status,
                last_guess: finalGuess
            });

            if (upsertError) {
                console.error('Failed to record puzzle attempt:', upsertError.message);
                return;
            }

            // Win or loss both complete the quest — quitting (never reaching here) does not
            // We use claimQuestProgress directly to bypass UI validations that might race with the upsert above
            const { claimQuestProgress } = await import('@/actions/quest-actions');
            const [dailyResult] = await Promise.all([
                claimQuestProgress('codele',     'daily'),   // daily: play once
                claimQuestProgress('codele_3w',  'weekly'),  // weekly: play 3x
                claimQuestProgress('codele_15m', 'monthly'), // monthly: play 15x
            ]);
            // Show XP/coins earned if the daily quest just completed
            if (dailyResult.isComplete && dailyResult.xpAwarded) {
                setQuestReward({ xp: dailyResult.xpAwarded, coins: dailyResult.coinsAwarded ?? 0 });
            }
            // Refresh the profile so XP/coins update immediately in the UI
            await refreshProfile();
            // Notify parent (e.g. dashboard) so it can refresh the quests widget
            onComplete?.();
        };

        if (currentGuess === solution) {
            trigger('success');
            setGameState("won");
            checkGameEnd("won", currentRow + 1, currentGuess);
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
                colors: ["#D4F268", "#1A1A1A", "#FFFFFF"]
            });
        } else if (currentRow === 5) {
            trigger('error');
            setGameState("lost");
            checkGameEnd("lost", 6, currentGuess);
        } else {
            setCurrentRow((prev) => prev + 1);
            setCurrentGuess("");
        }
    };

    // Handler for on-screen keyboard clicks
    const handleKeyClick = (key: string) => {
        if (gameState !== "playing") return;

        if (key === "ENTER") {
            if (currentGuess.length !== 5) {
                trigger('error');
                setShakeRow(true);
                setTimeout(() => setShakeRow(false), 500);
                return;
            }
            trigger('click');
            submitGuess();
        } else if (key === "←") {
            trigger('pop');
            setCurrentGuess((prev) => prev.slice(0, -1));
        } else {
            if (currentGuess.length < 5) {
                trigger('pop');
                setCurrentGuess((prev) => prev + key);
            }
        }
    };

    // Auto-scroll to result when game ends
    const resultRef = useAutoScroll<HTMLDivElement>({
        trigger: gameState !== "playing" ? gameState : undefined,
        offset: -50
    });

    if (!isOpen && !inline) return null;

    const Container = inline ? motion.div : motion.div;
    const Wrapper = inline ? "div" : "div";

    // For inline mode, we don't want the fixed overlay.
    // We treat the inner content as the main thing.

    const content = (
        <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            className={`
                p-8 w-full max-w-lg overflow-hidden relative
                ${inline ? "bg-white border text-center rounded-[2.5rem] shadow-xl shadow-slate-200/60" : "bg-white rounded-3xl shadow-2xl"}
            `}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div className={`px-4 py-2 rounded-full font-black text-xs uppercase tracking-[0.2em] ${inline ? "bg-zinc-100 text-zinc-500" : "bg-black text-white"}`}>
                    Codele
                </div>
                {!inline && (
                    <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Game Grid */}
            <div className="flex flex-col gap-3 mb-8 items-center">
                {guesses.map((guess, i) => (
                    <motion.div
                        key={i}
                        animate={shakeRow && i === currentRow ? { x: [-5, 5, -5, 5, 0] } : {}}
                        className="grid grid-cols-5 gap-3"
                    >
                        {Array(5).fill(0).map((_, j) => {
                            const letter = (i === currentRow ? currentGuess[j] : guess[j]) || "";
                            let status = "default";

                            if (i < currentRow) {
                                if (letter === solution[j]) status = "correct";
                                else if (solution.includes(letter)) status = "present";
                                else status = "absent";
                            }

                            return (
                                <motion.div
                                    key={j}
                                    initial={i < currentRow ? { rotateY: 0 } : {}}
                                    animate={i < currentRow ? {
                                        rotateY: [0, 90, 0],
                                    } : {}}
                                    transition={{
                                        duration: 0.6,
                                        delay: i < currentRow ? j * 0.1 : 0,
                                        times: [0, 0.5, 1]
                                    }}
                                    className={`
                                        w-12 h-12 md:w-14 md:h-14 flex items-center justify-center text-2xl font-black rounded-2xl border-2 transition-colors
                                        ${status === "default" && i === currentRow && letter ? "animate-pop border-zinc-400 text-zinc-900 bg-white shadow-lg" : ""}
                                        ${status === "default" && i !== currentRow ? "border-zinc-100 text-zinc-900 bg-zinc-50/50" : ""}
                                        
                                        ${status === "correct" ? "bg-lime-500 border-lime-500 text-zinc-900 shadow-md shadow-lime-200" : ""}
                                        ${status === "present" ? "bg-amber-400 border-amber-400 text-white shadow-md shadow-amber-200" : ""}
                                        ${status === "absent" ? "bg-zinc-100 border-zinc-100 text-zinc-400" : ""}
                                    `}
                                    style={{
                                        transformStyle: 'preserve-3d',
                                    }}
                                >
                                    {letter}
                                </motion.div>
                            );
                        })}
                    </motion.div>
                ))}
            </div>

            {/* Keyboard Help / Result */}
            {gameState !== "playing" ? (
                <div ref={resultRef} className="text-center space-y-6 animate-fade-in-up">
                    {gameState === "won" ? (
                        <div className={`p-6 rounded-3xl flex flex-col items-center ${inline ? "bg-lime-50 text-lime-900" : "bg-lime-50 text-lime-900"}`}>
                            <Trophy size={48} className={`mb-3 ${inline ? "text-lime-600" : "text-lime-600"}`} />
                            <h3 className="text-3xl font-black mb-1">Solved!</h3>
                            <p className="font-medium opacity-80">Streak extended +1 🔥</p>
                            {questReward && (
                                <div className="flex items-center gap-3 mt-3 px-4 py-2 bg-white/70 rounded-2xl border border-lime-200">
                                    <span className="text-sm font-black text-blue-600">+{questReward.xp} XP</span>
                                    <span className="text-lime-300 font-bold">·</span>
                                    <span className="text-sm font-black text-amber-500">+{questReward.coins} Coins</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className={`p-6 rounded-3xl flex flex-col items-center ${inline ? "bg-rose-50 text-rose-800" : "bg-rose-50 text-rose-800"}`}>
                            <AlertCircle size={48} className={`mb-3 ${inline ? "text-rose-500" : "text-rose-600"}`} />
                            <h3 className="text-3xl font-black mb-1">Missed it.</h3>
                            <p className="font-medium opacity-80">Word was: <span className="font-mono font-bold">{solution}</span></p>
                            {questReward && (
                                <div className="flex items-center gap-3 mt-3 px-4 py-2 bg-white/70 rounded-2xl border border-rose-200">
                                    <span className="text-sm font-black text-blue-600">+{questReward.xp} XP</span>
                                    <span className="text-rose-200 font-bold">·</span>
                                    <span className="text-sm font-black text-amber-500">+{questReward.coins} Coins</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Share Component */}
                    <div className="max-w-md mx-auto">
                        <DailyCodeleShare
                            guesses={guesses.filter(g => g !== "")}
                            solution={solution}
                            won={gameState === "won"}
                            attempts={guesses.filter(g => g !== "").length}
                        />
                    </div>

                    <Button
                        onClick={() => {
                            trigger('pop');
                            setGuesses(Array(6).fill(""));
                            setCurrentGuess("");
                            setCurrentRow(0);
                            setGameState("playing");
                            setLetterStatuses({});
                            // solution stays as today's puzzle word (already in state)
                        }}
                        className={`w-full font-bold py-4 text-lg rounded-2xl shadow-lg hover:shadow-xl transition-all ${inline ? "bg-zinc-900 text-white hover:bg-zinc-800" : "bg-black text-white hover:bg-zinc-800"}`}
                    >
                        Play Again <RefreshCw size={18} className="ml-2" />
                    </Button>
                </div>
            ) : (
                <>
                    <div className="text-center space-y-2 mb-4">
                        {errorMessage && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 font-bold text-sm"
                            >
                                {errorMessage}
                            </motion.div>
                        )}
                        <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">
                            Type to guess • Enter to submit
                        </div>
                    </div>

                    {/* On-Screen Keyboard */}
                    <div className="space-y-2">
                        {[
                            ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
                            ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
                            ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "←"]
                        ].map((row, rowIndex) => (
                            <div key={rowIndex} className="flex gap-1 justify-center">
                                {row.map((key) => {
                                    const status = letterStatuses[key];
                                    const isSpecial = key === "ENTER" || key === "←";

                                    return (
                                        <button
                                            key={key}
                                            onClick={() => handleKeyClick(key)}
                                            className={`
                                                ${isSpecial ? "px-2 md:px-3 text-[10px] md:text-xs" : "w-7 h-10 md:w-9 md:h-12 text-sm md:text-base"}
                                                rounded-lg font-black uppercase transition-all active:scale-95
                                                ${!status && "bg-zinc-200 text-zinc-900 hover:bg-zinc-300"}
                                                ${status === "correct" && "bg-lime-500 text-zinc-900 shadow-md"}
                                                ${status === "present" && "bg-amber-400 text-white shadow-md"}
                                                ${status === "absent" && "bg-zinc-400 text-zinc-600"}
                                            `}
                                        >
                                            {key}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </motion.div>
    );

    const questModal = (
        <AnimatePresence>
            {questReward && !questModalDismissed && (
                <CodeleQuestModal
                    isWin={gameState === "won"}
                    solution={solution}
                    guessesUsed={currentRow + 1}
                    xpEarned={questReward.xp}
                    coinsEarned={questReward.coins}
                    onDismiss={() => setQuestModalDismissed(true)}
                />
            )}
        </AnimatePresence>
    );

    if (inline) {
        return (
            <>
                <div className="flex justify-center">{content}</div>
                {questModal}
            </>
        );
    }

    return (
        <>
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    {content}
                </motion.div>
            </AnimatePresence>
            {questModal}
        </>
    );
}
