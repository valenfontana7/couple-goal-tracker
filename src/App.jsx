import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  // connectAuthEmulator, // Make sure this is not imported or used unless running emulator
} from "firebase/auth";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  query,
  getDocs,
  setDoc,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDI3gppFXh7QEMk5zHfp99vkiUg7x8XK2k",
  authDomain: "couple-goal-tracker.firebaseapp.com",
  projectId: "couple-goal-tracker",
  storageBucket: "couple-goal-tracker.firebasestorage.app",
  messagingSenderId: "1081972536498",
  appId: "1:1081972536498:web:5958ab7cc660d26fe085ab",
  measurementId: "G-4HZXMMYK4Z",
};

// Configuración de Firebase y inicialización
const app = initializeApp(firebaseConfig); // Initialize Firebase app here
const appId =
  typeof firebaseConfig.appId !== "undefined"
    ? firebaseConfig.appId
    : "default-app-id";

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const [columns, setColumns] = useState([]);
  const [cards, setCards] = useState([]);
  const [newCardText, setNewCardText] = useState("");

  // --- Inicialización de Firebase y Autenticación ---
  useEffect(() => {
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);

    // Only connect to emulator if running locally and emulator is running
    // if (window.location.hostname === "localhost") {
    //   connectAuthEmulator(firebaseAuth, "http://localhost:9099");
    // }

    setDb(firestoreDb);
    setAuth(firebaseAuth);
    setAuth(firebaseAuth);

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        setUserId(user.uid);
        setLoading(false);
      } else {
        try {
          // Intenta obtener el token de autenticación personalizado de window o de una variable de entorno
          const initialAuthToken =
            (typeof window !== "undefined" && window.__initial_auth_token) ||
            import.meta.env.VITE_REACT_APP_INITIAL_AUTH_TOKEN;

          if (initialAuthToken) {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        } catch (err) {
          console.error("Error during authentication:", err);
          setError("Error al autenticar. Por favor, inténtalo de nuevo.");
          setLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // --- Cargar Columnas y Tarjetas de Firestore ---
  useEffect(() => {
    if (db && userId) {
      const loadBoardData = async () => {
        try {
          // Definir la referencia al documento base del tablero para este usuario
          // Corregido: couple_goals_board ahora es un documento dentro de la colección 'boards'
          const userBoardDocRef = doc(
            db,
            `artifacts/${appId}/users/${userId}/boards/couple_goals_board`
          );

          // Asegurarse de que el documento del tablero existe antes de acceder a subcolecciones
          // Si no existe, créalo (sin sobreescribir si ya existe)
          try {
            await setDoc(
              userBoardDocRef,
              { createdAt: new Date().toISOString() },
              { merge: true }
            );
          } catch (err) {
            console.error("Error al crear el documento del tablero:", err);
            showCustomModal("Error al crear el tablero de metas.");
            return;
          }

          // Cargar columnas
          let fetchedColumns = [];
          try {
            const columnsCollectionRef = collection(userBoardDocRef, "columns");
            const columnsSnapshot = await getDocs(query(columnsCollectionRef));
            fetchedColumns = columnsSnapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }));

            // Si no hay columnas, crear las predeterminadas
            if (fetchedColumns.length === 0) {
              const defaultColumns = [
                { id: "ideas", title: "Ideas", order: 0 },
                { id: "in-progress", title: "En Progreso", order: 1 },
                { id: "completed", title: "Completadas", order: 2 },
              ];
              for (const col of defaultColumns) {
                await setDoc(doc(columnsCollectionRef, col.id), col);
              }
              fetchedColumns = defaultColumns;
            }
            fetchedColumns.sort((a, b) => a.order - b.order);
            setColumns(fetchedColumns);
          } catch (err) {
            console.error("Error al cargar las columnas:", err);
            showCustomModal("Error al cargar las columnas del tablero.");
            return;
          }

          // Suscribirse a cambios en las tarjetas
          try {
            const cardsCollectionRef = collection(userBoardDocRef, "cards");
            const unsubscribeCards = onSnapshot(
              query(cardsCollectionRef),
              (snapshot) => {
                const fetchedCards = snapshot.docs.map((doc) => ({
                  id: doc.id,
                  ...doc.data(),
                }));
                setCards(fetchedCards);
              },
              (err) => {
                console.error("Error fetching cards:", err);
                showCustomModal("Error al cargar las metas.");
              }
            );

            // Guardar el unsubscribe para limpiar el listener al desmontar
            return () => unsubscribeCards();
          } catch (err) {
            console.error("Error al suscribirse a las tarjetas:", err);
            showCustomModal(
              "Error al suscribirse a las metas. Verifica tu configuración de Firestore."
            );
            return;
          }
        } catch (err) {
          console.error("Error al cargar el tablero:", err);
          showCustomModal("Error al cargar el tablero de metas.");
        }
      };
      loadBoardData();
    }
  }, [db, userId]);

  // --- Funciones de Utilidad ---
  const showCustomModal = (message) => {
    setModalMessage(message);
    setShowModal(true);
  };

  const closeCustomModal = () => {
    setShowModal(false);
    setModalMessage("");
  };

  // --- Gestión de Tarjetas ---
  const handleAddCard = async (columnId) => {
    if (!newCardText.trim()) {
      showCustomModal("Por favor, ingresa el texto de la meta.");
      return;
    }
    if (!db || !userId) {
      showCustomModal("La base de datos no está lista. Inténtalo de nuevo.");
      return;
    }

    try {
      // Referencia al documento del tablero dentro de la colección 'boards'
      const userBoardDocRef = doc(
        db,
        `artifacts/${appId}/users/${userId}/boards/couple_goals_board`
      );
      const cardsCollectionRef = collection(userBoardDocRef, "cards");
      await addDoc(cardsCollectionRef, {
        text: newCardText,
        columnId: columnId,
        createdAt: new Date().toISOString(),
      });
      setNewCardText("");
      showCustomModal("Meta agregada exitosamente.");
    } catch (e) {
      console.error("Error adding card: ", e);
      showCustomModal("Error al agregar la meta.");
    }
  };

  const handleMoveCard = async (cardId, newColumnId) => {
    if (!db || !userId) {
      showCustomModal("La base de datos no está lista. Inténtalo de nuevo.");
      return;
    }
    try {
      // Referencia al documento del tablero dentro de la colección 'boards'
      const userBoardDocRef = doc(
        db,
        `artifacts/${appId}/users/${userId}/boards/couple_goals_board`
      );
      const cardRef = doc(collection(userBoardDocRef, "cards"), cardId);
      await updateDoc(cardRef, {
        columnId: newColumnId,
      });
      showCustomModal("Meta movida exitosamente.");
    } catch (e) {
      console.error("Error moving card: ", e);
      showCustomModal("Error al mover la meta.");
    }
  };

  const handleDeleteCard = async (cardId) => {
    if (!db || !userId) {
      showCustomModal("La base de datos no está lista. Inténtalo de nuevo.");
      return;
    }
    try {
      // Referencia al documento del tablero dentro de la colección 'boards'
      const userBoardDocRef = doc(
        db,
        `artifacts/${appId}/users/${userId}/boards/couple_goals_board`
      );
      await deleteDoc(doc(collection(userBoardDocRef, "cards"), cardId));
      showCustomModal("Meta eliminada exitosamente.");
    } catch (e) {
      console.error("Error deleting card: ", e);
      showCustomModal("Error al eliminar la meta.");
    }
  };

  // --- Renderizado de la Aplicación ---
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">
          Cargando aplicación...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 rounded-lg">
        <div className="text-xl font-semibold">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 to-red-100 p-4 font-inter">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg p-6 sm:p-8 md:p-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-gray-800 mb-8">
          💕 Metas de Pareja 💕
        </h1>

        {userId && (
          <div className="text-center text-sm text-gray-600 mb-6 p-2 bg-pink-50 rounded-lg">
            Tu ID de Usuario:{" "}
            <span className="font-mono break-all">{userId}</span>
          </div>
        )}

        {/* Input para nueva meta */}
        <div className="mb-8 p-6 bg-pink-50 rounded-lg shadow-inner flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Escribe una nueva meta para la pareja (ej: 'Viaje a la Patagonia', 'Leer un libro juntos')"
            value={newCardText}
            onChange={(e) => setNewCardText(e.target.value)}
            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-400 focus:border-transparent transition duration-200"
          />
          <button
            onClick={() => handleAddCard("ideas")} // Añadir a la columna de Ideas por defecto
            className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
          >
            Añadir Meta
          </button>
        </div>

        {/* Columnas del Tablero */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {columns.map((column, colIndex) => (
            <div
              key={column.id}
              className="bg-gray-50 rounded-lg shadow-md p-4 flex flex-col h-full"
            >
              <h2 className="text-xl font-semibold text-gray-700 mb-4 text-center border-b pb-2 border-gray-200">
                {column.title}
              </h2>
              <div className="flex-grow space-y-3 min-h-[100px]">
                {cards
                  .filter((card) => card.columnId === column.id)
                  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)) // Ordenar por fecha de creación
                  .map((card) => (
                    <div
                      key={card.id}
                      className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm flex flex-col"
                    >
                      <p className="text-gray-800 font-medium mb-2">
                        {card.text}
                      </p>
                      <div className="flex justify-between items-center text-sm text-gray-500 mt-auto pt-2 border-t border-gray-100">
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          className="text-red-500 hover:text-red-700 transition duration-150 ease-in-out"
                          title="Eliminar meta"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm6 3a1 1 0 100 2h-2a1 1 0 100-2h2z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                        <div className="flex space-x-1">
                          {colIndex > 0 && (
                            <button
                              onClick={() =>
                                handleMoveCard(
                                  card.id,
                                  columns[colIndex - 1].id
                                )
                              }
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1 px-2 rounded-md transition duration-150 ease-in-out text-xs"
                              title={`Mover a ${columns[colIndex - 1].title}`}
                            >
                              &larr;
                            </button>
                          )}
                          {colIndex < columns.length - 1 && (
                            <button
                              onClick={() =>
                                handleMoveCard(
                                  card.id,
                                  columns[colIndex + 1].id
                                )
                              }
                              className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1 px-2 rounded-md transition duration-150 ease-in-out text-xs"
                              title={`Mover a ${columns[colIndex + 1].title}`}
                            >
                              &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm text-center">
            <p className="text-lg font-semibold text-gray-800 mb-4">
              {modalMessage}
            </p>
            <button
              onClick={closeCustomModal}
              className="bg-pink-500 hover:bg-pink-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
