import AttendanceFoundationPage from "@/features/attendance/components/AttendanceFoundationPage";

export default function AdminAttendance() {
  return (
    <AttendanceFoundationPage
      icon="📋"
      eyebrow="Présences & absences"
      title="Pilotage de l'assiduité"
      description="Supervisez les présences, absences, retards, séances et justificatifs à l'échelle de l'établissement."
      items={[
        {
          title: "Vue établissement",
          description:
            "Analyser l'assiduité par classe, période, apprenant et statut.",
        },
        {
          title: "Suivi des séances",
          description:
            "Consulter les appels réalisés par les enseignants et les situations enregistrées.",
        },
        {
          title: "Traitement des justificatifs",
          description:
            "Examiner, accepter ou rejeter les justificatifs nécessitant une intervention administrative.",
        },
      ]}
    />
  );
}