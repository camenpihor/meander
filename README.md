# Meander

## Project Overview

**Meander** is a web app that centers around a map where tree locations and metadata are stored. The app is built using React and utilizes Firebase Firestore for data storage. The app is intended to be a nature companion, helping users explore and document tree locations.

## Tooling

- **Frontend Framework:** React
- **Programming Language:** TypeScript
- **State Management:** Context API
- **Mapping Library:** React-Leaflet
- **Version Control:** Git
- **Database:** Firebase Firestore

## Tasks

1. **Set Up Boilerplate:**
   - `npx create-react-app meander --template typescript`

2. **Design Database:**
   - Create Firebase Firestore
   - Set up Firebase SDK

3. **Build Core Features:**
   - **Map View:** Implement a map view using Leaflet.
   - **Data Handling:** Integrate Firestore.
   - **Data Exploration:** Search around you, generate statistics, find trees.

4. **Implement UI/UX:**
   - Design and implement the app’s UI.
   - Create views and components.

5. **Test Basic Functionality:**
   - Test the map view, data fetching, and data exploration in your web browser.

6. **Set Up Deployment:**
   - Set up GitHub Pages.
   - Deploy the app and test.

## Libraries

```bash
npm install react-router-dom react-leaflet leaflet firebase tailwindcss axios gh-pages
```

- **React Router:** For handling navigation within the app.
- **React-Leaflet:** For integrating maps.
- **Firebase SDK:** For Firestore, Authentication, and any other Firebase services.
- **Context API:** For simple state management (comes with React).
- **Tailwind CSS:** CSS framework.
- **Axios:** HTTP requests (if needed for additional APIs).
- **GitHub Pages:** Deploy to GitHub
