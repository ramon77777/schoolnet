import AttendanceFoundationPage from "@/features/attendance/components/AttendanceFoundationPage";

export default function TeacherAttendance() {
  return (
    <AttendanceFoundationPage
      icon="✅"
      eyebrow="Présences & absences"
      title="Gestion des présences"
      description="Créez vos séances, effectuez l'appel de vos classes et traitez les justificatifs liés aux séances dont vous êtes responsable."
      items={[
        {
          title: "Faire l'appel",
          description:
            "Créer une séance puis marquer chaque apprenant présent, absent ou en retard.",
        },
        {
          title: "Historique",
          description:
            "Retrouver les appels déjà effectués et consulter les informations enregistrées.",
        },
        {
          title: "Justificatifs",
          description:
            "Examiner puis accepter ou rejeter les justificatifs des séances dont vous êtes responsable.",
        },
      ]}
    />
  );
}